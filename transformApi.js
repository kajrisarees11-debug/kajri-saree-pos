module.exports = function(fileInfo, api) {
  const j = api.jscodeshift;
  const root = j(fileInfo.source);

  // 1. Remove `import { IS_CLOUD } from '@/lib/dataAdapter';` or `IS_CLOUD` from the import list
  root.find(j.ImportDeclaration, { source: { value: '@/lib/dataAdapter' } }).forEach(path => {
    path.node.specifiers = path.node.specifiers.filter(s => s.local.name !== 'IS_CLOUD');
  });

  // 2. Find any `if (IS_CLOUD) { ... }` block
  root.find(j.IfStatement, { test: { name: 'IS_CLOUD' } }).forEach(path => {
    const parentBlock = path.parent;
    if (parentBlock && parentBlock.node.type === 'BlockStatement') {
      const blockBody = parentBlock.node.body;
      const ifIndex = blockBody.indexOf(path.node);
      
      // Remove all statements AFTER the `if (IS_CLOUD)` statement in this block, 
      // because they are the SQLite fallback
      blockBody.splice(ifIndex + 1);

      // Now replace the `if (IS_CLOUD) { ... }` with its contents
      if (path.node.consequent.type === 'BlockStatement') {
        blockBody.splice(ifIndex, 1, ...path.node.consequent.body);
      }
    }
  });

  return root.toSource();
};
