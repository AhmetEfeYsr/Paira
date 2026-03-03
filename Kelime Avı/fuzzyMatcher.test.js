const { FuzzyMatcher } = require('./game.js');

const matcher = new FuzzyMatcher();

const testCases = [
    { word1: '', word2: '', expected: 0, description: 'Empty string vs Empty string' },
    { word1: '', word2: 'a', expected: 1, description: 'Empty string vs Single character' },
    { word1: 'a', word2: '', expected: 1, description: 'Single character vs Empty string' },
    { word1: '', word2: 'abc', expected: 3, description: 'Empty string vs Multiple characters' },
    { word1: 'araba', word2: 'araba', expected: 0, description: 'Exact match' },
    { word1: 'a', word2: 's', expected: 0.4, description: 'Keyboard adjacency' },
    { word1: 'ab', word2: 'ba', expected: 0.5, description: 'Transposition' }
];

let failed = false;

testCases.forEach(({ word1, word2, expected, description }) => {
    const result = matcher.getDistance(word1, word2);
    if (Math.abs(result - expected) > 0.0001) {
        console.error(`FAILED: ${description}`);
        console.error(`  Words: "${word1}", "${word2}"`);
        console.error(`  Expected: ${expected}, Got: ${result}`);
        failed = true;
    } else {
        console.log(`PASSED: ${description}`);
    }
});

if (failed) {
    process.exit(1);
} else {
    console.log('\nAll FuzzyMatcher tests passed!');
}
