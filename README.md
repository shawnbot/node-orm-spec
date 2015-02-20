# :construction: node-orm-spec
This is a helper library for defining model "suites" with [node-orm]. Model objects in a "suite" know how to transform data from the outside world into objects that their `.create()` method expects, like so:

```js
var spec = require('node-orm-spec'),
    assert = require('assert');

// define your suite with spec.suite()
var suite = spec.suite({
  models: {
    Foo: {
      fields: {
        name: {type: 'text', from: 'Name'}
      }
  }
});

/*
 * you can use suite.connect() as a shortcut, or:
 
 * orm.connect('...', function(error, db) {
 *   suite.create(db); // this is synchronous
 * });
 */
suite.connect('sqlite://test.db', function(error, db) {
  var Foo = db.models.Foo,
      input = {Name: 'Zaphod'},
      output = Foo.transform(input);
  Foo.create(output, function(error, zaphod) {
    assert.equal(zaphod.name, 'Zaphod', 'name mismatch: ' + zaphod.name);
  });
});
```

## Streams
Models created by a "suite" have a method for transforming objects in a stream:

```js
var Foo = db.models.Foo,
    csv = require('fast-csv'),
    fs = require('fs');

fs.createReadStream('foo.csv')
  .pipe(csv())
  .pipe(Foo.createTransformStream())
  .on('data', function(d, next) {
    Foo.create(d, next);
  });
```

[node-orm]: https://github.com/dresende/node-orm2
