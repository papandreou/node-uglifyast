node-uglifyast
==============

Convert back and forth between UglifyJS ASTs and JavaScript objects.

Example:

```javascript
var uglifyAst = require('uglifyast');
console.warn(uglifyAst.objToAst({foo: ['bar', 9, 4], quux: {baz: 4}}));
```

Produces:
```
[ 'object',
  [ [ 'foo',
      [ 'array', [ [ 'string', 'bar' ], [ 'num', 9 ], [ 'num', 4 ] ] ] ],
    [ 'quux', [ 'object', [ [ 'baz', [ 'num', 4 ] ] ] ] ] ] ]
```

And the other way around:

```javascript
console.warn(uglifyAst.astToObj(['array', [['string', 'abc'], ['num', 1]]]));
```

Output:
```
[ 'abc', 1 ]
```

License
-------

3-clause BSD license -- see the `LICENSE` file for details.
