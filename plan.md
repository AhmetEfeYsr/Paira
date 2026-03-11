1. Update fallback questions in `BilgiYarismasi/game.js` to use the new field names (`soru_metni`, `dogru_cevap`, `yanlis_secenekler`, `kategori`, `zorluk`).
2. Update the `populateCategories` function in `BilgiYarismasi/game.js` to handle `w.kategori` which is an array in the new `tr.json`. The current implementation assumes it's a string (`const cats = [...new Set(allQuestions.map(w => w.category).filter(Boolean))];`). It needs to be updated to extract categories from arrays.
3. Update the category filtering logic in `BilgiYarismasi/game.js` to match against the `kategori` array in the question object. `let filtered = allQuestions.filter(q => (selCats.length === 0 || q.kategori.some(cat => selCats.includes(cat))) && (q.zorluk >= minD && q.zorluk <= maxD));`
4. Update `getShuffledChoices` in `BilgiYarismasi/game.js` to use `dogru_cevap` and `yanlis_secenekler` (which is an array, so extract elements 0, 1, 2).
5. Update `startTurn` in `BilgiYarismasi/game.js` to use `kategori` (join the array into a string) and `soru_metni` when creating `state.currentQuestion`.
6. Update the pre-commit step to ensure proper testing, verification, review, and reflection are done.
