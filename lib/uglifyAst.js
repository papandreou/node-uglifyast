var uglifyJs = require('uglify-js'),
    uglifyAst = module.exports = {};

// JSON subset supported
uglifyAst.objToAst = function (obj, canonicalize) {
    if (obj === null) {
        return new uglifyJs.AST_Null();
    } else if (obj === true) {
        return new uglifyJs.AST_True();
    } else if (obj === false) {
        return new uglifyJs.AST_False();
    } else if (Array.isArray(obj)) {
        return new uglifyJs.AST_Array({
            elements: obj.map(function (item) {
                return uglifyAst.objToAst(item, canonicalize);
            })
        });
    } else if (typeof obj === 'object') {
        var keys = Object.keys(obj);
        if (canonicalize) {
            keys = keys.sort();
        }
        return new uglifyJs.AST_Object({
            properties: keys.map(function (key) {
                return new uglifyJs.AST_ObjectKeyVal({
                    key: key,
                    value: uglifyAst.objToAst(obj[key], canonicalize)
                });
            })
        });
    } else if (typeof obj === 'number') {
        return new uglifyJs.AST_Number({value: obj});
    } else if (typeof obj === 'string') {
        return new uglifyJs.AST_String({value: obj});
    } else if (typeof obj === 'function') {
        var functionAst = uglifyJs.parse('!' + obj.toString()).body[0].body.expression;
        if (functionAst.name && functionAst.name.name === 'anonymous') {
            functionAst.name = null;
        }
        return functionAst;
    } else if (typeof obj === 'undefined') {
        return new uglifyJs.AST_Undefined();
    } else {
        throw new Error("uglifyAst.objToAst: Cannot convert " + JSON.stringify(obj));
    }
};

// JSON subset supported
uglifyAst.astToObj = function (ast) {
    if (ast instanceof uglifyJs.AST_String || ast instanceof uglifyJs.AST_Number) {
        return ast.value;
    } else if (ast instanceof uglifyJs.AST_True) {
        return true;
    } else if (ast instanceof uglifyJs.AST_False) {
        return false;
    } else if (ast instanceof uglifyJs.AST_Null) {
        return null;
    } else if (ast instanceof uglifyJs.AST_Undefined) {
        return undefined;
    } else if (ast instanceof uglifyJs.AST_Object) {
        // What about AST_ObjectGetter and AST_ObjectSetter?
        var obj = {};
        ast.properties.forEach(function (objectKeyValNode) {
            obj[objectKeyValNode.key] = uglifyAst.astToObj(objectKeyValNode.value);
        });
        return obj;
    } else if (ast instanceof uglifyJs.AST_Array) {
        return ast.elements.map(uglifyAst.astToObj);
    } else if (ast instanceof uglifyJs.AST_Function) {
        return new Function(ast.argnames.map(function (argnameNode) {return argnameNode.name;}).join(","),
                            new uglifyJs.AST_Toplevel({body: ast.body}).print_to_string());
    } else {
        throw new Error("uglifyAst.astToObj: Cannot convert " + JSON.stringify(ast));
    }
};

uglifyAst.getFunctionBodyAst = function (lambda) {
    return uglifyJs.parse("(" + lambda.toString() + ")")[1][0][1][3];
};

var astNodeTypes = ['array', 'object'];

// Extracts code string => occurrences hash
uglifyAst.findOccurrencesByCode = function (ast) {
    var occurrencesByCode = {},
        walker = new uglifyJs.TreeWalker(function (node) {
            if (node instanceof uglifyJs.AST_Array || node instanceof uglifyJs.AST_Object) {
                var code = node.print_to_string();
                if (code.length > 20) {
                    (occurrencesByCode[code] = occurrencesByCode[code] || []).push({
                        node: node, stack: [].concat(walker.stack)
                    });
                }
            }
        });

    ast.walk(walker);

    return occurrencesByCode;
};

uglifyAst.iterateOverOccurrences = function (occurrencesByCode, longestFirst, lambda) {
    Object.keys(occurrencesByCode).sort(function (a, b) {
        return longestFirst ? b.length - a.length : a.length - b.length;
    }).forEach(function (code) {
        var occurrences = [].concat(occurrencesByCode[code]);
        if (lambda(code, occurrences) !== false) {
            for (var i = 1 ; i < occurrences.length ; i += 1) {
                var occurrence = occurrences[i],
                    walker = new uglifyJs.TreeWalker(function (node) {
                        if (node instanceof uglifyJs.AST_Array || node instanceof uglifyJs.AST_Object) {
                            var occurrencesOfThisCode = occurrencesByCode[node.print_to_string()];
                            if (occurrencesOfThisCode) {
                                var indexOfThisOccurrence = occurrencesOfThisCode.indexOf(node);
                                if (indexOfThisOccurrence !== -1) {
                                    occurrencesOfThisCode.splice(indexOfThisOccurrence, 1);
                                }
                            }
                        }
                    });
                occurrence.node.walk(walker);
            }
        }
    });
};

// Assumes that all nodes in the ast are "const", adds var declaration at top. The 'ast' parameter must be an AST_Toplevel node.
uglifyAst.pullCommonStructuresIntoVars = function (ast, varNamePrefix) {
    varNamePrefix = varNamePrefix || '_' + (Math.floor(1000000 * Math.random())).toString(36);

    var occurrencesByCode = uglifyAst.findOccurrencesByCode(ast),
        varDefNodes = [],
        nextVarNumber = 1;

    uglifyAst.iterateOverOccurrences(occurrencesByCode, false, function (code, occurrences) {
        if (occurrences.length > 1 && occurrences.length * code.length > 10) {
            var varName = varNamePrefix + nextVarNumber;
            nextVarNumber += 1;
            varDefNodes.push(new uglifyJs.AST_VarDef({name: new uglifyJs.AST_SymbolVar({name: varName}), value: occurrences[0].node.clone()}));
            occurrences.forEach(function (occurrence) {
                uglifyAst.replaceDescendantNode(occurrence.stack[occurrence.stack.length - 2],
                                                occurrence.node, new uglifyJs.AST_SymbolRef({name: varName}));
            });
        } else {
            return false;
        }
    });
    if (varDefNodes.length > 0) {
        ast.body.unshift(new uglifyJs.AST_Var({
            definitions: varDefNodes
        }));
    }
};

uglifyAst.parseExpression = function (str) {
    return uglifyJs.parse('var _bogus = (' + str + ')').body[0].definitions[0].value;
};

uglifyAst.replaceDescendantNode = function (ancestorNode, oldNode, newNode) {
    ancestorNode.transform(new uglifyJs.TreeTransformer(function (node) {
        if (node === oldNode) {
            newNode.start = oldNode.start;
            newNode.end = oldNode.end;
            return newNode;
        }
    }));
    return newNode;
};
