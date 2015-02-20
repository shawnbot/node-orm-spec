var orm = require('orm'),
    assert = require('assert'),
    moment = require('moment'),
    extend = require('xtend'),
    es = require('event-stream');

/**
 * @name spec.suite
 *
 * Creates a model suite from the input `spec` object, which is a
 * hash of model definitions:
 *
 * @param   {Spec}  spec  the input spec
 * @return  {Suite} returns a suite definition
 */
var suite = function(spec) {
  assert.equal(typeof spec, 'object',
    'expected spec object, got ' + (typeof spec));
  assert.equal(typeof spec.models, 'object',
    'expected spec.models object, got ' + (typeof spec.models));

  /**
   * @typedef   Spec
   * @type      {Object}
   * @property  {Model}  models     each key in the `models` property
   *                                describes a model
   * @property  {Object} relations  each key in the `relations`
   *                                property should be a function
   *                                that sets up relations for that model
   */

  /**
   * @typedef   Model
   * @type      {Object}
   * @property  {Object} name     use this table name if provided,
   *                              otherwise use the key in the spec's
   *                              `models` object.
   * @property  {Object} fields   the field definitions
   * @property  {Object} options  model options
   */

  var models = spec.models;
  function create(db, done) {
    /*
     * spec.models take the form:
     *
     * {
     *    name: {
     *      name: 'table',    // optional table name
     *      fields: { ... },  // fields hash
     *      options: { ... }, // model options, e.g. methods
     *    }
     */
    for (var name in models) {
      var _model = models[name];
      assert.equal(typeof _model.fields, 'object',
        'expected model.fields object, got ' + (typeof _model.fields));
      var model = db.define(
        _model.name || name,
        _model.fields,
        _model.options
      );
      // Model.transform(input) -> {ready for insert}
      model.transform = transformer(_model.fields);
      // stream.pipe(Model.getTransformStream())
      model.getTransformStream = function() {
        return es.map(this.transform);
      };
    }

    /*
     * spec.relations take the form:
     *
     * {
     *    Foo: function(Foo) {
     *      // this is the `db` instance, e.g.
     *      Foo.hasMany(this.models.Bar);
     *    }
     * }   
     */
    if (typeof spec.relations === 'object') {
      for (var name in spec.relations) {
        spec.relations[name].call(db, _model[name]);
      }
    }

    return (typeof done === 'function')
      ? done(null, db.models)
      : db.models;
  }

  function connect(addr, done) {
    var db = orm.connect(addr)
      .on('connect', done);
    return create(db);
  }

  /**
   * @class Suite
   * @type  {Object}
   * @method create
   * @method connect
   */
  return {
    create: create,
    connect: connect
  };
};

module.exports = {
  version: require('./package.json').version,
  suite: suite,
  getter: getter,
  transformer: transformer,
  parse: {
    date: dateParser
  }
};

/**
 * @name spec.getter
 *
 * Create a property getter from a key. If `key` is a function,
 * just return it.
 *
 * @param {String|Function} key       the key string or function
 * @param {*}               default   the default value (N/A if `key`
 *                                    is a function)
 * @return {Function}
 */
function getter(key, def) {
  return typeof key === 'function'
    ? key
    : function(d) { return d[key] || def; };
}

/**
 * @name spec.parse.date
 *
 * Returns a date parsing function:
 *
 * @example
 *
 *    var parse = spec.parse.date('date', 'M/D/YY');
 *    parse({date: '6/12/81'}) -> new Date(1981, 5, 12)
 *    var parse = spec.parse.date(null, 'YYYY-MM-DD');
 *    parse.call({name: 'date'}, {date: '1981-06-12'}) -> new Date(1981, 5, 12)
 *
 * @param {String}        key     the key in the data to parse; if
 *                                null, use the field name
 * @param {String|Array}  format  the date format, a la moment
 * @param {Date}          default the default value if the parsed
 *                                date was invalid
 *
 * @return {Function}
 */
function dateParser(key, format, def) {
  return function(d) {
    // this is the field object
    var val = d[key || this.name],
        date = moment(d[key], format).toDate();
    return String(date) === 'Invalid Date'
      ? def
      : date || def;
  };
}

/**
 * @name spec.transformer
 *
 * Returns an object transformer function that reads values from keys
 * other than a model's fields from an input object and writes them
 * to the output object. The key here is each field's `from`
 * property, which can be either a string (a key in the input object)
 * or a function, which is called with the signature:
 *
 * from.call(field, input, name);
 *
 * @example
 *
 *    var tf = transformer({foo: {from: 'bar'}});
 *    tf({bar: 1}) -> {bar: 1, foo: 1}  // copies d.bar to d.foo
 *    tf({bar: 1}, true) -> {foo: 1}    // only transformed fields
 *
 *    // you can pass `only` to the generator, too
 *    tf = transformer({foo: {from: 'bar'}}, true);
 *    tf({bar: 1}) -> {foo: 1}
 *
 * @param {Object}    fields    a hash of model fields (properties)
 * @param {Boolean}   only      only return transformed fields
 *
 * @return {Function}
 */
function transformer(fields, only) {
  var transFields = {};
  for (var name in fields) {
    if (fields[name].from) {
      transFields[name] = fields[name];
    }
  }
  return function(d, _only) {
    var transformed = {};
    for (var name in transFields) {
      var field = transFields[name];
      transformed[name] = getter(field.from)
        .call(field, d, name);
    }
    return (_only || only) === true
      ? transformed
      : extend(d, transformed);
  };
}
