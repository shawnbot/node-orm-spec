var spec = require('../'),
    orm = require('orm'),
    fs = require('fs'),
    assert = require('assert'),
    moment = require('moment'),
    extend = require('xtend');

describe('transformer()', function() {

  it('transforms keys', function() {
    var tf = spec.transformer({
          foo: {from: 'bar'}
        }),
        original = {bar: 1},
        result = tf(original);
    assert.deepEqual(result, {bar: 1, foo: 1}, 'bad result: ' + JSON.stringify(result));
  });

  it('transforms with functions', function() {
    var tf = spec.transformer({
          foo: {from: function(d) { return d.bar + 1; }}
        }),
        original = {bar: 1},
        result = tf(original);
    assert.deepEqual(result, {bar: 1, foo: 2}, 'bad result: ' + JSON.stringify(result));
  });

});

describe('suite()', function() {
  var db,
      suite,
      filename = 'test.db',
      dateFormat = 'D/M/YY';

  var testSuite = {
    models: {
      Person: {
        fields: {
          first_name:   {type: 'text', from: 'First'},
          last_name:    {type: 'text', from: 'Last'},
          birthdate:    {type: 'date', from: spec.parse.date('Birthday', dateFormat)}
        },
        options: {
          methods: {
            name: function() {
              return [this.first_name, this.last_name].join(' ');
            },
            age: function(now) {
              return this.birthdate
                ? (now || new Date()).getFullYear() - this.birthdate.getFullYear()
                : undefined;
            }
          }
        }
      }
    }
  };

  beforeEach(function(done) {
    db = orm.connect('sqlite://' + filename)
      .on('connect', function(error) {
        if (error) throw error;
        done();
      });
  });

  afterEach(function(done) {
    db.close(function(error) {
      if (error) throw error;
      fs.unlink(filename, done);
    });
  });

  it('creates a suite', function() {
    suite = spec.suite(testSuite);
    assert.ok(suite, 'not ok: ' + suite);
    assert.equal(typeof suite.create, 'function',
      'expected suite.create function, got: ' + (typeof suite.create));
  });

  it('works', function() {
    var models = suite.create(db);
    assert.equal(typeof models, 'object',
      'expected models object, got: ' + (typeof models));
  });

  it('works async', function(done) {
    suite.create(db, function(error, models) {
      assert.ok(!error, 'error: ' + error);
      assert.equal(typeof models, 'object',
        'expected models object, got: ' + (typeof models));
      done();
    });
  });

  it('creates models', function(done) {
    var models = suite.create(db),
        Person = models.Person;

    assert.ok(db.models.Person, 'no db.models.Person object: ' + Object.keys(db));
    assert.ok(Person, 'no models.Person object: ' + Object.keys(models));
    assert.strictEqual(db.models.Person, Person, 'db.models.Person !== models.Person');

    Person.sync(function(error) {
      assert.ok(!error, 'Person.sync() error: ' + error);

      var bday = new Date(1981, 5, 12),
          input = {
            first_name: 'Shawn',
            last_name: 'Allen',
            birthdate: bday
          };
      Person.create(input, function(error, result) {
        assert.ok(!error, 'error creating person: ' + error);
        assert.deepEqual(input, result, 'model inequality: ' + JSON.stringify(result));

        var name = result.name(),
            age = result.age(new Date(2001, 5, 13));
        assert.equal(name, 'Shawn Allen', 'name() mismatch: ' + name);
        assert.equal(age, 20, 'age() mismatch: ' + age);

        done();
      });
    });
  });

  it('transforms models', function() {
    var models = suite.create(db),
        Person = models.Person,
        input = {
          First: 'Shawn',
          Last: 'Allen',
          Birthday: '6/12/81'
        },
        expected = {
          first_name: 'Shawn',
          last_name: 'Allen',
          birthdate: moment(input.Birthday, dateFormat).toDate()
        },
        result = Person.transform(input, true);

    assert.deepEqual(result, expected, 'bad transform (only fields): ' + JSON.stringify(result));
    expected = extend(input, expected);
    assert.deepEqual(Person.transform(input), expected, 'bad transform (extended): ' + JSON.stringify(result));
  });

});
