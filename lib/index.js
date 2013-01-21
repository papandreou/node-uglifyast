var _ = require('underscore'),
    uglifyJs = require('uglify-js'),
    uglifyAst = {};

// JSON subset supported
uglifyAst.objToAst = function (obj) {
    if (obj === null || obj === true || obj === false) {
        return ['name', "" + obj];
    } else if (_.isArray(obj)) {
        return ['array', obj.map(uglifyAst.objToAst)];
    } else if (typeof obj === 'object') {
        return ['object', Object.keys(obj).sort().map(function (key) {
            return [key, uglifyAst.objToAst(obj[key])];
        })];
    } else if (_.isNumber(obj)) {
        return ['num', obj];
    } else if (_.isString(obj)) {
        return ['string', obj];
    } else if (_.isFunction(obj)) {
        var functionAst = uglifyJs.parser.parse('!' + obj.toString())[1][0][1][2];
        if (functionAst[1] === 'anonymous') {
            functionAst[1] = null;
        }
        return functionAst;
    } else if (typeof obj === 'undefined') {
        return ['name', 'undefined'];
    } else {
        throw new Error("uglifyAst.objToAst: Cannot convert " + JSON.stringify(obj));
    }
};

// JSON subset supported
uglifyAst.astToObj = function (ast) {
    if (ast[0] === 'string' || ast[0] === 'num') {
        return ast[1];
    } else if (ast[0] === 'name') {
        if (ast[1] === 'false') {
            return false;
        } else if (ast[1] === 'true') {
            return true;
        } else if (ast[1] === 'null') {
            return null;
        } else if (ast[1] === 'undefined') {
            return undefined;
        } else {
            throw new Error('uglifyAst.astToObj: Unsupported ["name", ...] node');
        }
    } else if (ast[0] === 'object') {
        var obj = {};
        ast[1].forEach(function (keyAndValueArr) {
            obj[keyAndValueArr[0]] = uglifyAst.astToObj(keyAndValueArr[1]);
        });
        return obj;
    } else if (ast[0] === 'array') {
        return ast[1].map(uglifyAst.astToObj);
    } else if (ast[0] === 'function') {
        return new Function(ast[2].join(","), uglifyJs.uglify.gen_code(['toplevel', ast[3]]));
    } else {
        throw new Error("uglifyAst.astToObj: Cannot convert " + JSON.stringify(ast));
    }
};

uglifyAst.getFunctionBodyAst = function (lambda) {
    return uglifyJs.parser.parse("(" + lambda.toString() + ")")[1][0][1][3];
};

var astNodeTypes = ['array', 'object'];

// Extracts code string => occurrences hash
uglifyAst.findOccurrencesByCode = function (ast) {
    var walker = uglifyJs.uglify.ast_walker(),
        occurrencesByCode = {},
        walkerConfig = {};
    astNodeTypes.forEach(function (astNodeType) {
        walkerConfig[astNodeType] = function () {
            var code = uglifyJs.uglify.gen_code(this);
            if (code.length > 20) {
                (occurrencesByCode[code] = occurrencesByCode[code] || []).push({node: this, stack: [].concat(walker.stack())});
            }
        };
    });

    walker.with_walkers(walkerConfig, function () {
        walker.walk(ast);
    });
    return occurrencesByCode;
};

uglifyAst.iterateOverOccurrences = function (occurrencesByCode, lambda) {
    Object.keys(occurrencesByCode).sort(function (a, b) {
        return a.length - b.length;
    }).forEach(function (code) {
        var occurrences = [].concat(occurrencesByCode[code]);
        if (lambda(code, occurrences) !== false) {
            for (var i = 1 ; i < occurrences.length ; i += 1) {
                var occurrence = occurrences[i],
                    walkerConfig = {};
                astNodeTypes.forEach(function (astNodeType) {
                    walkerConfig[astNodeType] = function () {
                        var occurrencesOfThisCode = occurrencesByCode[uglifyJs.uglify.gen_code(this)];
                        if (occurrencesOfThisCode) {
                            var indexOfThisOccurrence = occurrencesOfThisCode.indexOf(this);
                            if (indexOfThisOccurrence !== -1) {
                                occurrencesOfThisCode.splice(indexOfThisOccurrence, 1);
                            }
                        }
                    };
                });
                var walker = uglifyJs.uglify.ast_walker();
                walker.with_walkers(walkerConfig, function () {
                    walker.walk(occurrence.node);
                });
                }
        }
    });
};

// Assumes that all nodes in the ast are "const", adds var declaration at top. The 'ast' parameter must be a ['toplevel', ...] node.
uglifyAst.pullCommonStructuresIntoVars = function (ast, varNamePrefix) {
    varNamePrefix = varNamePrefix || '_' + (Math.floor(1000000 * Math.random())).toString(36);

    var occurrencesByCode = uglifyAst.findOccurrencesByCode(ast),
        varDeclarations = [],
        nextVarNumber = 1;

    uglifyAst.iterateOverOccurrences(occurrencesByCode, function (code, occurrences) {
        if (occurrences.length > 1 && occurrences.length * code.length > 10) {
            var varName = varNamePrefix + nextVarNumber;
            nextVarNumber += 1;
            varDeclarations.push([varName, [].concat(occurrences[0].node)]);
            occurrences.forEach(function (occurrence) {
                occurrence.node.splice(0, occurrence.node.length, 'name', varName);
            });
        } else {
            return false;
        }
    });
    ast[1].unshift(['var', varDeclarations]);
};

uglifyAst.foldConstant = function (ast) {
    if (ast[0] === 'string') {
        return ast;
    }
    return uglifyJs.uglify.ast_squeeze(['toplevel', [['var', [['__bogus', ast]]]]])[1][0][1][0][1];
};

uglifyAst.parseExpression = function (str) {
    return uglifyJs.parser.parse('var _bogus = (' + str + ')')[1][0][1][0][1];
};

_.extend(exports, uglifyAst);
