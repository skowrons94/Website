/**
 * Unit tests for the Italian article rule in lib/localize.mjs:
 * `npm run test:i18n`. The article before a nuclide follows its mass number
 * as it is read aloud (otto, diciotto, ottantacinque).
 */
import assert from "node:assert/strict"
import { italianNumber, vowelMassNumber, elideItalian } from "../lib/localize.mjs"

let failures = 0
function check(name, fn) {
  try {
    fn()
  } catch (e) {
    failures++
    console.error(`FAIL ${name}\n  ${e.message.split("\n").join("\n  ")}`)
  }
}

const words = {
  1: "uno", 2: "due", 8: "otto", 11: "undici", 12: "dodici", 16: "sedici", 17: "diciassette",
  18: "diciotto", 19: "diciannove", 20: "venti", 21: "ventuno", 22: "ventidue", 28: "ventotto",
  80: "ottanta", 81: "ottantuno", 85: "ottantacinque", 88: "ottantotto", 89: "ottantanove",
  100: "cento", 108: "centotto", 111: "centoundici", 118: "centodiciotto", 180: "centottanta",
  208: "duecentotto", 209: "duecentonove", 238: "duecentotrentotto", 800: "ottocento",
  1000: "mille", 8000: "ottomila",
}
for (const [n, w] of Object.entries(words)) check(`italianNumber(${n})`, () => assert.equal(italianNumber(Number(n)), w))

const vowel = [1, 8, 11, 80, 81, 85, 86, 88, 89, 800, 808, 8000]
const consonant = [2, 3, 4, 6, 7, 9, 10, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 28, 79, 90, 100, 108, 111, 118, 180, 181, 208, 238, 1000]
for (const n of vowel) check(`vowelMassNumber(${n})`, () => assert.equal(vowelMassNumber(n), true))
for (const n of consonant) check(`!vowelMassNumber(${n})`, () => assert.equal(vowelMassNumber(n), false))

const sentences = [
  ["del ⁸B", "dell'⁸B"],
  ["del ⁸⁵Kr", "dell'⁸⁵Kr"],
  ["Apri la valutazione del ⁸Be", "Apri la valutazione dell'⁸Be"],
  ["del ¹⁸F", "del ¹⁸F"],
  ["dell'¹⁸F", "del ¹⁸F"],
  ["l'¹⁸O(p,α)", "la ¹⁸O(p,α)"],
  ["nel ¹⁸O", "nel ¹⁸O"],
  ["il ¹¹C", "l'¹¹C"],
  ["la ¹¹B(p,γ)", "l'¹¹B(p,γ)"],
  ["sul ⁸⁶Kr", "sull'⁸⁶Kr"],
  ["nell'¹⁵O", "nel ¹⁵O"],
  ["dell'¹⁶O", "del ¹⁶O"],
  ["l'³He", "il ³He"],
  ["sull'¹⁷O", "sul ¹⁷O"],
  ["Il ⁸B", "L'⁸B"],
  ["della ¹⁷O(p,γ)¹⁸F", "della ¹⁷O(p,γ)¹⁸F"],
  ["del ¹⁰⁸Pd", "del ¹⁰⁸Pd"],
  ["del ¹H", "dell'¹H"],
  ["il ⁸⁸Sr e il ¹⁸F", "l'⁸⁸Sr e il ¹⁸F"],
  ["Valutazione R-matrix del ¹⁸F", "Valutazione R-matrix del ¹⁸F"],
]
for (const [input, want] of sentences) check(`elideItalian(${input})`, () => assert.equal(elideItalian(input), want))

if (failures) {
  console.error(`${failures} failure(s)`)
  process.exit(1)
}
console.log(`localize: ${Object.keys(words).length + vowel.length + consonant.length + sentences.length} checks passed`)
