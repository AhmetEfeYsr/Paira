const fs = require('fs');
const content = fs.readFileSync('IsimSehir/app.js', 'utf-8');
console.log(content.match(/isHost/g).length);
