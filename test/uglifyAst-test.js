var vows = require('vows'),
    assert = require('assert'),
    uglifyJs = require('uglify-js'),
    uglifyAst = require('../lib/uglifyAst');

function testCase(ast, obj) {
    return {
        'from ast to obj': {
            topic: function () {
                return uglifyAst.astToObj(ast);
            },
            'should produce the expected JavaScript object': function (_obj) {
                assert.deepEqual(_obj, obj);
            }
        },
        'from ast to obj through uglifyJs.uglify.gen_code and eval': {
            topic: function () {
                return eval('(' + uglifyJs.uglify.gen_code(['toplevel', [['stat', ast]]]) + ')');
            },
            'should produce the expected JavaScript object': function (_obj) {
                assert.deepEqual(_obj, obj);
            }
        },
        'from obj to ast': {
            topic: function () {
                return uglifyAst.objToAst(obj);
            },
            'should produce the expected Ast': function (_ast) {
                assert.deepEqual(_ast, ast);
            }
        }
    };
}

vows.describe('Converting JavaScript objects to Uglify Asts and vice versa').addBatch({
    'convert null': testCase(
        ['name', 'null'],
        null
    ),
    'convert false': testCase(
        ['name', 'false'],
        false
    ),
    'convert true': testCase(
        ['name', 'true'],
        true
    ),
    'convert string literal': testCase(
        ['string', 'Hello, \u263a'],
        'Hello, \u263a'
    ),
    'convert number literal': testCase(
        ['num', 999],
        999
    ),
    'convert regexp literal': testCase(
        ['regexp', 'hey', 'gim'],
        /hey/gim
    ),
    'convert array literal': testCase(
        ['array', [['string', 'foo'], ['name', 'true'], ['array', [['name', 'null']]]]],
        ['foo', true, [null]]
    ),
    'convert object literal': testCase(
        ['object', [['keyName1', ['string', 'stringValue']], ['keyName2', ['array', [['name', 'null'], ['num', 10]]]]]],
        {keyName1: 'stringValue', keyName2: [null, 10]}
    ),
    'convert function to ast': {
        topic: uglifyAst.objToAst(function foo(bar, quux) {bar();}),
        'should produce the expected Ast': function (topic) {
            assert.deepEqual(topic, ['function', 'foo', ['bar', 'quux'], [['stat', ['call', ['name', 'bar'], []]]]]);
        }
    },
    'canonicalize option': {
        topic: uglifyAst.objToAst({b: 'b', a: 'a'}, true),
        'should put the keys in sorted order': function (ast) {
            assert.deepEqual(ast[1].map(function (keyValueNode) {
                return keyValueNode[0];
            }), ['a', 'b']);
        }
    },
    'without canonicalize option': {
        topic: uglifyAst.objToAst({b: 'b', a: 'a'}),
        'should put the keys in the original order': function (ast) {
            assert.deepEqual(ast[1].map(function (keyValueNode) {
                return keyValueNode[0];
            }), ['b', 'a']);
        }
    },
    'convert ast to function': {
        topic: function () {
            return uglifyAst.astToObj(['function', 'foo', ['bar', 'quux'], [['stat', ['call', ['name', 'bar'], []]]]]);
        },
        'should produce the expected object': function (topic) {
            assert.isFunction(topic);
            assert.matches(topic.toString(), /^function (?:anonymous\s?)?\(bar,\s*quux\)\s*\{[\n\s]*bar\(\);?[\s\n]*\}$/);
        }
    },
    'pullCommonStructuresIntoVars': {
        topic: function () {
            var ast = uglifyJs.parser.parse("var foo = [{bar: 'vqowiejjvqowejvqiwoevjqwev'}, 'quux', 'bar', {bar: 'vqowiejjvqowejvqiwoevjqwev'}];");
            uglifyAst.pullCommonStructuresIntoVars(ast, 'prefix');
            return ast;
        },
        'should pull {bar: \'vqowiejjvqowejvqiwoevjqwev\'} into a var': function (ast) {
            assert.equal(uglifyJs.uglify.gen_code(ast), 'var prefix1={bar:"vqowiejjvqowejvqiwoevjqwev"};var foo=[prefix1,"quux","bar",prefix1]');
        }
    }
})['export'](module);
