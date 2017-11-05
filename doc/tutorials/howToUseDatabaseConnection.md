# Initial setup

```javascript
var DatabaseConnection = require('metisoft-database-util').DatabaseConnection;

var dbc = new DatabaseConnection('under-dev');        // configure from environment settings

    // or...

var dbc = new DatabaseConnection({                    // configure directly
  verbose: false,
  connection: {
    // ...
  }
});

    // or...

var dbc = new DatabaseConnection();                   // configure later


```

To configure a `DatabaseConnection` object, please refer to `DatabaseConnection()`, `configDirectly()`, and `configFromEnvSettings()`.

# Running queries

## Promises

Every method in this class that communicates with the database will return a [bluebird][1] Promise object. Here's a simple example of how you can use a Promise to retrieve the results of a query:

```javascript
dbc.query("SELECT * FROM site_user")
  .then((results) => {
    // do something with the results
  });
```

For more in-depth examples of how Promises are used, please refer to the [bluebird API reference][2].

[1]: http://bluebirdjs.com/docs/getting-started.html
[2]: http://bluebirdjs.com/docs/api-reference.html

## Types of queries

There are two methods of running queries on the SQL server. The first method, the simple method, is used when you only need to run a single query. An example might be that you have a user ID and you need to pull the associated user record from the database. In this situation, you would call `query()` without passing a client object:

```javascript
db.query("SELECT username, user_password FROM site_user WHERE id = $1", [47])
  .then((userRecord) => {
    // do something with the user record
  });
```

Behind the scenes, a client will be pulled from the client pool, the query will run on it, and then the client will be released back to the pool.

The other method is used when you have a series of queries to run. If you tried to run a series of queries with the simple method, the library would try to grab a client for each one, and would very quickly run out of available clients, resulting in a runtime exception. In order to run a series of queries properly, you'll want to grab a client from the pool and hold on to it. You'll use this client to run all of your queries, and then give it back to the pool when you're done.

Calling `getClient()` will retrieve a client that you can use. It returns a [PgPool](https://github.com/brianc/node-pg-pool) Client object. This can be passed into query functions to have the queries run on that client. Calling `client.release()` will release the client back to the pool, which should be done once you are finished with it.

It is highly recommended that you call `client.release()` within a `.finally()` call on the returned Promise. `.finally()` will always run, regardless of what code path is followed in the chain of Promise resolutions, and regardless of whether exceptions are handled or not. This way, you can ensure that you don't leak clients. Example:

```javascript
function getAllUsers() {
  var client;

  return dbc.getClient()
    .then((c) => {
      // save the references so we can use them later
      client = c;
      
      // do some queries now
      return dbc.queryReturningMany("SELECT * FROM site_user", [], client);
    })
    
    .then((users) => {
      // final return value from getAllUsers()
      return users;
    })
    
    .finally(() => {
      // this will still run no matter what!
      // release the client back to the pool
      client.release();
    });
}
```

In the following example, we want to grab a full questionnaire from the database. This involves grabbing the questionnaire record, grabbing each question record, and grabbing each answer type associated with each question. Specifically:

 1. Grab the questionnaire record from `crm.qstnr` to get basic data about the questionnaire
 2. Use the N:M association table `crm.qstnr_x_qstnr_question` to find all question IDs associated with the questionnaire and grab the question records from `crm.qstnr_question`
 3. Use the N:M association table `crm.qstnr_question_x_enum_qstnr_answer_type` to find all answer type IDs associated with a question and grab the names of those answer types
 
So in the end, we should have the questionnaire data, a list of questions for that questionnaire, and for each question, a list of answer types.

**Disclaimers:**
- Please note that there are some optimizations that could be made -- certain queries could run in parallel -- but this version should suffice to illustrate a series of queries.
- Prefer using Squel to build queries instead of the raw string queries presented below. String queries are used below to keep the example concise.

```javascript
var sprintf = require('sprintf-js').sprintf,
    client,
    questionnaireData;

dbc.getClient()
  .then((c) => {
    client = c;
    
    // grab questionnaire record
    return dbc.queryReturningOne('SELECT id, name, conditions, question_order AS "questionOrder" FROM crm.qstnr WHERE id = $1', [7], client);
  })
  
  .then((questionnaire) => {
    // save the data to a local variable
    questionnaireData = questionnaire;
    questionnaireData.questions = {};
    
    // grab all the questions
    return dbc.queryReturningMany(
      'SELECT question.id AS "id", question.content AS "content" '
        + 'FROM crm.qstnr_question AS "question" '
        + 'LEFT JOIN crm.qstnr_x_qstnr_question AS rel ON (question.id = rel.qstnr_question_id) '
        + 'WHERE rel.qstnr_id = $1',
      [questionnaire.id],
      client);
  })
  
  .then((questions) => {
    var questionIds = questions.map((question) => {
      // save the question locally
      questionnaireData.questions[question.id] = question;
      questionnaireData.questions[question.id].answerTypes = {};
      
      return question.id;
    });
    
    // grab all answer types for each question
    return dbc.queryReturningMany(
      'SELECT at.id AS "answerTypeId", at.name AS "answerTypeName", '
        + 'x.qstnr_question_id AS "questionId" '
        + 'FROM crm.enum_qstnr_answer_type AS at '
        + 'LEFT JOIN crm.qstnr_question_x_enum_qstnr_answer_type AS x ON (x.enum_qstnr_answer_type_id = at.id) '
        + sprintf('WHERE x.qstnr_question_id IN (%s)', questionIds.join(', ')),
      [],
      client);
  })
  
  .each((answerType) => {    
    // create a mapping of answerTypeName to the empty string for O(1) lookup
    questionnaireData.questions[answerType.questionId].answerTypes[answerType.answerTypeName] = '';
  })
  
  .then(() => {
    return questionnaireData;
  })
  
  .finally(() => {
    // release the client back to the pool
    client.release();
  });
```

# Squel

In general, you should not use raw strings to build your SQL queries. Instead, we can use [Squel][3] to help us build queries in a less brittle way. In the following example, we'll see two equivalent queries: one given as a raw string, and one generated using Squel.

```javascript
/* Raw string method */

// Find the user with the ID of 10
var stringQuery = 
  'SELECT id, name, conditions, question_order AS "questionOrder" '
  + 'FROM crm.qstnr ' 
  + 'WHERE id = $1';
  
var values = [10];

dbc.query(stringQuery, values)
  .then(() => {
    // do stuff
  });

/* Using Squel instead */

// Find the user with the ID of 10
var queryObj = squel.useFlavour('postgres')
  .select({autoQuoteAliasNames: true, nameQuoteCharacter: '"', tableAliasQuoteCharacter: '"'})
    .field('id')
    .field('name')
    .field('conditions')
    .field('question_order', 'questionOrder')
  .from('crm.qstnr')
    .where('id = $1');
    
var values = [10];

dbc.query(queryObj.toString(), values)
  .then(() => {
    // do stuff
  });
```

For the most part, you are simply making function calls on the Squel object where before you were concatenating strings. In this example, however, the Squel method has some extra noise. Notice the call to `useFlavour()` and the configuration object passed into `select()`. These should be used every time for Metisoft app queries, but they are annoying to type every time. For this reason, `DatabaseConnection` includes some convenience methods to abstract away those details.

The above Squel query could be rewritten as such:

```javascript
// Find the user with the ID of 10
var queryObj = dbc.getSquelSelect()
    .field('id')
    .field('name')
    .field('conditions')
    .field('question_order', 'questionOrder')
  .from('crm.qstnr')
    .where('id = $1');
```

Much less typing in this version.

Also notice how the parameterized query convention of using `$1`, `$2`, etc. with an accompanying array of values has not changed. However, you might want to have Squel create the parameterized query and array for you. By using Squel, the template and the values used to populate it can be given in the same line, making the query more readable.

```javascript
/* Making parameterized queries yourself --
    query and values are separated, which might be harder to read */

    .where('contact.meta_entry_user_id = $1')
    .where('contact.meta_entry_user_company_id = $2')
    
  // ...
  // more code...
  // ...
  
  values = [userId, companyId];
  
/* Using Squel to make parameterized queries --
    values are inline with the query */

    .where('contact.meta_entry_user_id = ?', userId)
    .where('contact.meta_entry_user_company_id = ?', companyId)
```

When using Squel to generate parameterized queries, you need to call `.toParam()` on the Squel query object instead of `.toString()`, so that you can retrieve both the query text and the values array. To make using Squel-generated queries a little easier, the `DatabaseConnection` class provides a series of convenience functions that use the return value of `.toParam()` to execute queries. These functions are `squelQuery()`, `squelQueryReturningMany()`, and `squelQueryReturningOne()`.

```javascript
var queryObj = dbc.getSquelSelect()
    .field('id')
    .field('name')
    .field('conditions')
    .field('question_order', 'questionOrder')
  .from('crm.qstnr')
    .where('id = ?', userId);

dbc.squelQueryReturningOne(queryObj.toParam())
  .then((user) => {
    // do stuff
  });
```

For more information on the capabilities of Squel, please refer to the [Squel guide][3].

[3]: https://hiddentao.github.io/squel/


























