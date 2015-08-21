var vows = require('vows'),
    assert = require('assert'),
    uglifyJs = require('uglify-js'),
    uglifyAst = require('../lib/uglifyAst')(uglifyJs);

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
        'from ast to obj through ast.print_to_string() and eval': {
            topic: function () {
                return eval('(' + ast.print_to_string() + ')');
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
                assert.ok(_ast.equivalent_to(ast));
            }
        }
    };
}

function createFoldConstantTestCase(inputStr, expectedOutputStr) {
    return {
        topic: uglifyAst.foldConstant(uglifyAst.parseExpression(inputStr)),
        'should return the expected result': function (topic) {
            assert.equal(topic.print_to_string(), expectedOutputStr);
        }
    };
}

vows.describe('Converting JavaScript objects to Uglify Asts and vice versa').addBatch({
    'convert null': testCase(
        new uglifyJs.AST_Null(),
        null
    ),
    'convert false': testCase(
        new uglifyJs.AST_False(),
        false
    ),
    'convert true': testCase(
        new uglifyJs.AST_True(),
        true
    ),
    'convert string literal': testCase(
        new uglifyJs.AST_String({value: 'Hello, \u263a'}),
        'Hello, \u263a'
    ),
    'convert number literal': testCase(
        new uglifyJs.AST_Number({value: 999}),
        999
    ),
    'convert array literal': testCase(
        new uglifyJs.AST_Array({
            elements: [
                new uglifyJs.AST_String({value: 'foo'}),
                new uglifyJs.AST_True(),
                new uglifyJs.AST_Array({
                    elements: [
                        new uglifyJs.AST_Null()
                    ]
                })
            ]
        }),
        ['foo', true, [null]]
    ),
    'convert object literal': testCase(
        new uglifyJs.AST_Object({
            properties: [
                new uglifyJs.AST_ObjectKeyVal({
                    key: 'keyName1',
                    value: new uglifyJs.AST_String({value: 'stringValue'})
                }),
                new uglifyJs.AST_ObjectKeyVal({
                    key: 'keyName2',
                    value: new uglifyJs.AST_Array({
                        elements: [
                            new uglifyJs.AST_Null(),
                            new uglifyJs.AST_Number({value: 10})
                        ]
                    })
                })
            ]
        }),
        {keyName1: 'stringValue', keyName2: [null, 10]}
    ),
    'convert regular expression': testCase(
        new uglifyJs.AST_RegExp({
            value: /foobar/igm
        }),
        /foobar/igm
    ),
    'convert function to ast': {
        topic: uglifyAst.objToAst(function foo(bar, quux) {bar();}),
        'should produce the expected ast': function (topic) {
            assert.ok(topic.equivalent_to(
                new uglifyJs.AST_Function({
                    name: new uglifyJs.AST_SymbolDeclaration({name: 'foo'}),
                    argnames: [
                        new uglifyJs.AST_SymbolFunarg({name: 'bar'}),
                        new uglifyJs.AST_SymbolFunarg({name: 'quux'})
                    ],
                    body: [
                        new uglifyJs.AST_SimpleStatement({
                            body: new uglifyJs.AST_Call({
                                expression: new uglifyJs.AST_SymbolRef({name: 'bar'}),
                                args: []
                            })
                        })
                    ]
                })
            ));
        }
    },
    'canonicalize option': {
        topic: uglifyAst.objToAst({b: 'b', a: 'a'}, true),
        'should put the keys in sorted order': function (ast) {
            assert.deepEqual(ast.properties.map(function (objectKeyValNode) {
                return objectKeyValNode.key;
            }), ['a', 'b']);
        }
    },
    'without canonicalize option': {
        topic: uglifyAst.objToAst({b: 'b', a: 'a'}),
        'should put the keys in the original order': function (ast) {
            assert.deepEqual(ast.properties.map(function (objectKeyValNode) {
                return objectKeyValNode.key;
            }), ['b', 'a']);
        }
    },
    'convert ast to function': {
        topic: function () {
            return uglifyAst.astToObj(
                new uglifyJs.AST_Function({
                    name: new uglifyJs.AST_SymbolDeclaration({name: 'foo'}),
                    argnames: [
                        new uglifyJs.AST_SymbolFunarg({name: 'bar'}),
                        new uglifyJs.AST_SymbolFunarg({name: 'quux'})
                    ],
                    body: [
                        new uglifyJs.AST_SimpleStatement({
                            body: new uglifyJs.AST_Call({
                                expression: new uglifyJs.AST_SymbolRef({name: 'bar'}),
                                args: []
                            })
                        })
                    ]
                })
            );
        },
        'should produce the expected object': function (topic) {
            assert.isFunction(topic);
            assert.matches(topic.toString(), /^function (?:anonymous\s?)?\(bar,\s*quux\)\s*\{[\n\s]*bar\(\);?[\s\n]*\}$/);
        }
    },
    'uglifyAst.pullCommonStructuresIntoVars': {
        topic: function () {
            var ast = uglifyJs.parse("var foo = [{bar: 'vqowiejjvqowejvqiwoevjqwev'}, 'quux', 'bar', {bar: 'vqowiejjvqowejvqiwoevjqwev'}];");
            uglifyAst.pullCommonStructuresIntoVars(ast, 'prefix');
            return ast;
        },
        'should pull {bar: \'vqowiejjvqowejvqiwoevjqwev\'} into a var': function (ast) {
            assert.equal(ast.print_to_string(), 'var prefix1={bar:"vqowiejjvqowejvqiwoevjqwev"};var foo=[prefix1,"quux","bar",prefix1];');
        }
    },
    'uglifyAst.replaceDescendantNode': {
        topic: function () {
            var ast = uglifyJs.parse('var a = 123');
            uglifyAst.replaceDescendantNode(ast, ast.body[0].definitions[0].value, new uglifyJs.AST_Number({value: 456}));
            return ast;
        },
        'should replace 123 with 456': function (ast) {
            assert.equal(ast.print_to_string(), 'var a=456;');
        }
    },
    'uglifyAst.parseExpression': {
        topic: function () {
            return uglifyAst.parseExpression('123');
        },
        'should return an AST_Number node with the expected properties': function (ast) {
            assert.ok(ast instanceof uglifyJs.AST_Number);
            assert.equal(ast.value, 123);
            assert.equal(ast.print_to_string(), '123');
        }
    },
    'uglifyAst.foldConstant': {
        'string': createFoldConstantTestCase('"foo"', '"foo"'),
        'simple foldable expression': createFoldConstantTestCase("2 + 2", "4"),
        'partially foldable expression': createFoldConstantTestCase("foo + (2 + 2)", "foo+4")
    },
    'uglifyAst.clone': function () {
        var ast = uglifyAst.parseExpression('{foo: "bar"}'),
            clonedAst = uglifyAst.clone(ast);
        assert.equal(ast.print_to_string(), clonedAst.print_to_string());
        assert.ok(ast !== clonedAst);
    }
})['export'](module);
