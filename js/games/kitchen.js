/* Little Kitchen — cook real Indonesian home dishes side by side.
 *
 * One kitchen, two boards. Each player has their own board (player 1 on the
 * left, player 2 on the right) holding exactly one job: crack the egg, wash the
 * cucumber, chop, pound, fry and flip, stir the pot, or (for the grown-up) find
 * the right jar on the shelf. Nothing is held or chosen that the other player
 * could take: a tap on a board only ever changes that board. A step ("beat")
 * moves on when both boards are done; then everything both of them made flies
 * into the one dish in the middle. The last beat is tasting it together (or
 * blowing out the candles), then a present: new recipes, kitchen helpers (a
 * cat, a hen, a radio, herbs), a nicer kitchen, shelf decorations, medals.
 * The kitchen is kept between rounds; an unfinished dish is simply not kept.
 *
 * Nothing burns, spills or runs out. A wrong jar is a joke. Every tap answers.
 *
 * Timing: every state change bumps `token`; every game-logic timer goes
 * through later(), which does nothing once the token has moved on, so a late
 * callback from an old beat can never act. ctx.lock is never used: pauses
 * (the golden latch, a flip in the air) are per-board timestamps.
 */
(function () {
  'use strict';

  /* ---------------------------------------------------------- the dishes */

  // `n` is the base number of taps at Normal with no help. `to` says where the result goes
  // at the merge: into the dish ('mid'), kept on the same board for its next job ('stay'),
  // or handed to the other board's next job ('across').
  // '$' = the variant she picked (its emoji), '$c' = its paint colour: see resolveJob().
  // A fridge's `e` may also be 'jelly' or 'scoop': drawn in CSS in her colour (in the fridge, in the air, in the dish).
  // Bubur's porridge: a warm cream that stands out from the bowl's light inside and the wall, in both themes (the same
  // colour as --kt-porridge in the stylesheet, which draws it across the mouth of the 🥣 sticker).
  var PORRIDGE = '#E9D7AE';
  var RECIPES = {
    /* ---- meals ---- */
    ceplok: { e: '🍳', vessel: 'plate', beats: [   // Telur Ceplok: fried egg (start)
      { a: { do: 'crack', e: '🥚', n: 2, to: 'stay' },                     b: { do: 'wash', e: '🥒', n: 3, to: 'stay' } },
      { a: { do: 'fry', e: '🍳', prop: 'pan', end: 'flip', to: 'mid' },     b: { do: 'chop', e: '🥒', n: 4, to: 'mid' } },
      { extra: true, a: { do: 'chop', e: '🍅', n: 3, to: 'mid' },           b: { do: 'chop', e: '🍅', n: 4, to: 'mid' } },
      { a: { do: 'pick', choices: ['🍚', '🍞', '🍜'] },                      b: { do: 'fetch', e: '🍶', jars: ['🍶', '🍫', '🍓'], to: 'mid' } },   // nasi / roti / mie with the egg
      { extra: true, a: { do: 'shake', e: '🧂', dots: '#FFFFFF', n: 3 },    b: { do: 'fetch', e: '🌶️', jars: ['🌶️', '🍫', '🍓'], to: 'mid' } },   // a pinch of salt; the sambal
      { a: { do: 'taste' }, b: { do: 'taste' } }] },
    goreng: { e: '🍛', vessel: 'wok', mix: '#B8742E', stir: 'sizzle', afterStir: 'toss', beats: [   // Nasi Goreng
      { a: { do: 'wash', e: '🥬', n: 3, to: 'across' },                    b: { do: 'wash', e: '🥕', n: 3, to: 'across' } },
      { a: { do: 'chop', e: '🥕', n: 3, to: 'mid' },                       b: { do: 'chop', e: '🥬', n: 4, to: 'mid' } },
      { a: { do: 'pick', choices: ['🍳', '🍗', '🦐'] },                      b: { do: 'scoop', e: '🍚' } },                        // telur / ayam / udang on top; he scoops the rice
      { extra: true, a: { do: 'crack', e: '🥚', n: 2, to: 'mid' },          b: { do: 'fetch', e: '🍶', jars: ['🍶', '🍫', '🍯'], to: 'mid' } },
      { a: { do: 'stir', n: 4 },                                            b: { do: 'stir', n: 4 } },
      { a: { do: 'taste' }, b: { do: 'taste' } }] },
    sate: { e: '🍢', vessel: 'plate', beats: [   // Sate Ayam with peanut sauce
      { a: { do: 'chop', e: '🍗', n: 3, to: 'stay' },                      b: { do: 'chop', e: '🍗', n: 4, to: 'stay' } },
      { a: { do: 'skewer', e: '🍗', to: 'stay' },                          b: { do: 'skewer', e: '🍗', to: 'stay' } },
      { a: { do: 'fry', e: '🍢', prop: 'grill', end: 'flip', to: 'mid' },   b: { do: 'fry', e: '🍢', prop: 'grill', end: 'flip', to: 'mid' } },
      { extra: true, a: { do: 'pound', e: '🥜', n: 3, to: 'mid' },          b: { do: 'pound', e: '🥜', n: 4, to: 'mid' } },
      { a: { do: 'pick', choices: ['🍙', '🍚', '🥒'] },                      b: { do: 'fetch', e: '🍋', jars: ['🍋', '🍫', '🍓'], to: 'mid' } },   // lontong / nasi / timun
      { a: { do: 'taste' }, b: { do: 'taste' } }] },
    sop: { e: '🍲', vessel: 'pot', mix: '#F2C14E', stir: 'swish', afterStir: 'lid', taste: 'hot', beats: [   // Sayur Sop
      { a: { do: 'wash', e: '🥕', n: 3, to: 'stay' },                      b: { do: 'peel', e: '🥔', n: 3, to: 'stay' } },
      { a: { do: 'chop', e: '🥕', n: 3, to: 'mid' },                       b: { do: 'chop', e: '🥔', n: 4, to: 'mid' } },
      { extra: true, a: { do: 'pour', e: '💧', liquid: '#8FD3F4', n: 3 },   b: { do: 'fetch', e: '🍗', jars: ['🍗', '🍫', '🍓'], to: 'mid' } },
      { a: { do: 'pick', choices: ['🌽', '🥦', '🍅'] },                      b: { do: 'shake', e: '🧂', dots: '#FFFFFF', n: 3 } },  // jagung / brokoli / tomat; he salts
      { a: { do: 'stir', n: 4 },                                            b: { do: 'stir', n: 4 } },
      { a: { do: 'taste' }, b: { do: 'taste' } }] },
    mie: { e: '🍜', vessel: 'wok', mix: '#D9A441', look: 'noodle', stir: 'sizzle', afterStir: 'toss', beats: [   // Mie Goreng
      { a: { do: 'wash', e: '🥬', n: 3, to: 'stay' },                      b: { do: 'wash', e: '🥕', n: 3, to: 'stay' } },
      { a: { do: 'chop', e: '🥬', n: 3, to: 'mid' },                       b: { do: 'chop', e: '🥕', n: 4, to: 'mid' } },
      { extra: true, a: { do: 'crack', e: '🥚', n: 2, to: 'mid' },          b: { do: 'fetch', e: '🍶', jars: ['🍶', '🍓', '🍫'], to: 'mid' } },
      { a: { do: 'pick', choices: ['🥟', '🍤', '🍗'] },                      b: { do: 'scoop', e: '🍜' } },                        // pangsit / udang goreng / ayam; he scoops the noodles
      { a: { do: 'stir', n: 4 },                                            b: { do: 'stir', n: 4 } },
      { a: { do: 'taste' }, b: { do: 'taste' } }] },
    bubur: { e: '🥣', vessel: 'bowl', mix: PORRIDGE, stir: 'swish', taste: 'hot', beats: [   // Bubur Ayam
      { a: { do: 'pour', e: '💧', liquid: '#8FD3F4', n: 3 },                b: { do: 'scoop', e: '🍚' } },
      { a: { do: 'stir', n: 4 },                                            b: { do: 'stir', n: 4 } },                           // rice + water -> porridge
      { a: { do: 'chop', e: '🍗', n: 3, to: 'mid' },                       b: { do: 'chop', e: '🍗', n: 4, to: 'mid' } },       // ayam suwir
      { a: { do: 'pick', choices: ['🍘', '🥜', '🥚'] },                      b: { do: 'pour', e: '🍶', liquid: '#4A2A17', n: 2, drizzle: true } },   // kerupuk / kacang / telur; kecap
      { extra: true, a: { do: 'garnish', e: '🌿' },                          b: { do: 'fetch', e: '🌶️', jars: ['🌶️', '🍫', '🍓'], to: 'mid' } },
      { a: { do: 'taste' }, b: { do: 'taste' } }] },
    gado: { e: '🥗', vessel: 'plate', beats: [   // Gado-Gado
      { a: { do: 'wash', e: '🥬', n: 3, to: 'stay' },                      b: { do: 'peel', e: '🥔', n: 3, to: 'stay' } },
      { a: { do: 'chop', e: '🥬', n: 3, to: 'mid' },                       b: { do: 'chop', e: '🥔', n: 4, to: 'mid' } },
      { extra: true, a: { do: 'crack', e: '🥚', n: 2, to: 'mid' },          b: { do: 'fetch', e: '🥒', jars: ['🥒', '🍫', '🍓'], to: 'mid' } },   // telur rebus; acar
      { a: { do: 'pound', e: '🥜', n: 3, to: 'mid' },                      b: { do: 'pound', e: '🥜', n: 4, to: 'mid' } },       // bumbu kacang, two cobeks
      { a: { do: 'pick', choices: ['🍘', '🍙', '🌶️'] },                      b: { do: 'chop', e: '🍅', n: 4, to: 'mid' } },        // kerupuk / lontong / pedas
      { a: { do: 'taste' }, b: { do: 'taste' } }] },
    pizza: { e: '🍕', vessel: 'pizza', bake: true, beats: [   // Pizza: baked in the middle after the last topping
      { a: { do: 'wash', e: '🍅', n: 3, to: 'stay' },                      b: { do: 'roll', e: '🍕', base: true, n: 4, to: 'mid' } },   // the base lands on the peel
      { a: { do: 'pound', e: '🍅', n: 3, to: 'mid' },                      b: { do: 'shake', e: '🧀', dots: '#FFE27A', n: 3 } },  // tomato sauce; grated cheese
      { a: { do: 'pick', choices: ['🌭', '🍗', '🍍'] },                      b: { do: 'fetch', e: '🌽', jars: ['🌽', '🍫', '🍓'], to: 'mid' } },   // sosis / ayam / nanas
      { extra: true, a: { do: 'garnish', e: '🌿' },                          b: { do: 'chop', e: '🍅', n: 4, to: 'mid' } },
      { a: { do: 'taste' }, b: { do: 'taste' } }] },
    /* ---- sweets ---- */
    pisang: { e: '🍌', vessel: 'plate', beats: [   // Pisang Goreng: fried bananas (start)
      { a: { do: 'peel', e: '🍌', n: 3, to: 'stay' },                      b: { do: 'peel', e: '🍌', n: 3, to: 'stay' } },
      { a: { do: 'chop', e: '🍌', n: 3, to: 'stay' },                      b: { do: 'chop', e: '🍌', n: 4, to: 'stay' } },   // fan cut (kipas)
      { a: { do: 'fry', e: '🍌', prop: 'pan', end: 'flip', to: 'mid' },     b: { do: 'fry', e: '🍌', prop: 'pan', end: 'flip', to: 'mid' } },
      { a: { do: 'pick', choices: ['🧀', '🍫', '🍓'] },                      b: { do: 'pour', e: '🥛', liquid: '#FFF4DC', n: 2, drizzle: true } },   // condensed milk
      { extra: true, a: { do: 'shake', e: '🍫', dots: '#5A3A22', n: 3 },   b: { do: 'fetch', e: '🍯', jars: ['🍯', '🧂', '🌶️'], to: 'mid' } },     // meses; honey
      { a: { do: 'taste' }, b: { do: 'taste' } }] },
    martabak: { e: '🥞', vessel: 'bowl', mix: '#F5DFA8', beats: [   // Martabak Manis
      { a: { do: 'crack', e: '🥚', n: 2, to: 'mid' },                      b: { do: 'fetch', e: '🥛', jars: ['🥛', '🍋', '🌶️'], to: 'mid' } },
      { a: { do: 'stir', n: 4 },                                            b: { do: 'stir', n: 4 } },
      { serve: 'plate', a: { do: 'fry', e: '🥞', prop: 'pan', end: 'flip', to: 'mid' }, b: { do: 'fry', e: '🥞', prop: 'pan', end: 'flip', to: 'mid' } },
      { a: { do: 'pick', choices: ['🍫', '🧀', '🍓'] },                     b: { do: 'pour', e: '🥛', liquid: '#FFF4DC', n: 2, drizzle: true } },
      { extra: true, a: { do: 'chop', e: '🍌', n: 3, to: 'mid' },           b: { do: 'chop', e: '🍌', n: 4, to: 'mid' } },
      { a: { do: 'taste' }, b: { do: 'taste' } }] },
    cake: { e: '🎂', vessel: 'bowl', mix: '#F5DFA8', beats: [   // Kue Ulang Tahun (capstone)
      { a: { do: 'crack', e: '🥚', n: 2, to: 'mid' },                      b: { do: 'fetch', e: '🥛', jars: ['🥛', '🧂', '🌶️'], to: 'mid' } },
      { a: { do: 'stir', n: 4 },                                            b: { do: 'stir', n: 4 } },
      { serve: 'cake', a: { do: 'fry', e: '🍰', prop: 'oven', end: 'out', to: 'mid' }, b: { do: 'fry', e: '🍰', prop: 'oven', end: 'out', to: 'mid' } },
      { a: { do: 'pick', choices: ['🍓', '🍫', '🍋'], paint: ['#F49AC1', '#8B5A3C', '#F7D35C'] }, b: { do: 'garnish', e: '🍓' } },
      { extra: true, a: { do: 'shake', e: '🍫', dots: '#5A3A22', n: 3 },   b: { do: 'shake', e: '🍫', dots: '#5A3A22', n: 3 } },
      { a: { do: 'blow' }, b: { do: 'blow' } }] },
    donat: { e: '🍩', vessel: 'bowl', mix: '#F3D9A4', beats: [   // Donat kentang: potato doughnuts
      { a: { do: 'crack', e: '🥚', n: 2, to: 'mid' },                      b: { do: 'fetch', e: '🥛', jars: ['🥛', '🌶️', '🍋'], to: 'mid' } },
      { extra: true, a: { do: 'pound', e: '🥔', n: 3, to: 'mid' },          b: { do: 'stir', n: 4 } },                           // mash the potato; the dough
      { a: { do: 'roll', e: '🍩', n: 3, to: 'stay' },                      b: { do: 'roll', e: '🍩', n: 4, to: 'stay' } },       // roll and cut a ring
      { serve: 'plate', a: { do: 'fry', e: '🍩', prop: 'pan', end: 'flip', to: 'mid' }, b: { do: 'fry', e: '🍩', prop: 'pan', end: 'flip', to: 'mid' } },
      { a: { do: 'pick', choices: ['🍫', '🍓', '🍋'], paint: ['#6B4226', '#F49AC1', '#F7E36A'] }, b: { do: 'shake', e: '🍬', dots: 'rainbow', n: 3 } },   // the glaze; rainbow sprinkles
      { a: { do: 'taste' }, b: { do: 'taste' } }] },
    /* ---- cold treats ---- */
    campur: { e: '🍧', vessel: 'glass', stir: 'clink', taste: 'cold', beats: [   // Es Campur
      { a: { do: 'wash', e: '🍓', n: 3, to: 'stay' },                      b: { do: 'chop', e: '🍉', n: 4, to: 'mid' } },
      { a: { do: 'chop', e: '🍓', n: 3, to: 'mid' },                       b: { do: 'chop', e: '🥭', n: 4, to: 'mid' } },
      { a: { do: 'garnish', e: '❄️' },                                      b: { do: 'fetch', e: '🥥', jars: ['🥥', '🧂', '🌶️'], to: 'mid' } },
      { a: { do: 'pick', choices: ['🍓', '🍈', '🍊'], paint: ['#E8455A', '#7BC96F', '#F59A3A'] }, b: { do: 'pour', e: '🥛', liquid: '#FFF4DC', n: 2, drizzle: true } },
      { extra: true, a: { do: 'stir', n: 3 },                               b: { do: 'stir', n: 3 } },
      { a: { do: 'taste' }, b: { do: 'taste' } }] },
    jus: { e: '🥤', vessel: 'blender', mix: '$c', taste: 'cold', beats: [   // Jus Buah: alpukat / mangga / stroberi
      { a: { do: 'pick', choices: ['🥑', '🥭', '🍓'], paint: ['#9BC25A', '#F7B23A', '#E8455A'] }, b: { do: 'fetch', e: '🥛', jars: ['🥛', '🧂', '🌶️'], to: 'mid' } },
      { a: { do: 'wash', e: '$', n: 3, to: 'stay' },                       b: { do: 'peel', e: '🍌', n: 3, to: 'stay' } },
      { a: { do: 'chop', e: '$', n: 3, to: 'mid' },                        b: { do: 'chop', e: '🍌', n: 4, to: 'mid' } },
      { a: { do: 'blend', n: 3 },                                           b: { do: 'blend', n: 3 } },
      { extra: true, a: { do: 'garnish', e: '🍒' },                          b: { do: 'pour', e: '🍫', liquid: '#5A3A22', n: 2, drizzle: true } },
      { a: { do: 'taste' }, b: { do: 'taste' } }] },
    puding: { e: '🍮', vessel: 'pot', mix: '$c', stir: 'swish', taste: 'cold', beats: [   // Puding
      { a: { do: 'pour', e: '🥛', liquid: '#FFFFFF', n: 3 },                b: { do: 'fetch', e: '🥥', jars: ['🥥', '🧂', '🌶️'], to: 'mid' } },
      { a: { do: 'pick', choices: ['🍓', '🍫', '🍈'], paint: ['#F49AC1', '#8B5A3C', '#9BCB5A'] }, b: { do: 'stir', n: 4 } },
      { serve: 'plate', a: { do: 'fry', e: 'jelly', prop: 'fridge', end: 'out', to: 'mid' }, b: { do: 'fry', e: 'jelly', prop: 'fridge', end: 'out', to: 'mid' } },
      { a: { do: 'chop', e: '$', n: 3, to: 'mid' },                        b: { do: 'pour', e: '🥛', liquid: '#FFF4DC', n: 2, drizzle: true } },   // her fruit on top; fla
      { extra: true, a: { do: 'garnish', e: '🍒' },                          b: { do: 'shake', e: '🍬', dots: 'rainbow', n: 3 } },
      { a: { do: 'taste' }, b: { do: 'taste' } }] },
    eskrim: { e: '🍦', vessel: 'bowl', mix: '$c', stir: 'swish', taste: 'cold', beats: [   // Es Krim
      { a: { do: 'pick', choices: ['🍓', '🍫', '🥭'], paint: ['#F49AC1', '#8B5A3C', '#F7B23A'] }, b: { do: 'fetch', e: '🥛', jars: ['🥛', '🧂', '🌶️'], to: 'mid' } },
      { a: { do: 'chop', e: '$', n: 3, to: 'mid' },                        b: { do: 'chop', e: '$', n: 4, to: 'mid' } },
      { a: { do: 'stir', n: 4 },                                            b: { do: 'stir', n: 4 } },
      { serve: 'cone', a: { do: 'fry', e: 'scoop', prop: 'fridge', end: 'out', to: 'mid' }, b: { do: 'fry', e: 'scoop', prop: 'fridge', end: 'out', to: 'mid' } },   // two scoops (her colour) on the cone
      { extra: true, a: { do: 'shake', e: '🍬', dots: 'rainbow', n: 3 },   b: { do: 'pour', e: '🍫', liquid: '#5A3A22', n: 2, drizzle: true } },
      { a: { do: 'taste' }, b: { do: 'taste' } }] },
    /* ---- sweets (v3) ---- */
    roti: { e: '🥪', vessel: 'plate', glaze: 'fill', beats: [   // Roti Bakar: her spread inside, grilled, SKM on top
      { a: { do: 'pick', choices: ['🍫', '🧀', '🍓'], paint: ['#6B4226', '#FFD84A', '#E8455A'] }, b: { do: 'spread', e: '🍞', c: '#F7D35C', n: 4, to: 'stay' } },   // cokelat / keju / selai stroberi; he butters his slice
      { a: { do: 'spread', e: '🍞', c: '$c', smear: true, n: 3, to: 'stay' }, b: { do: 'fry', e: '🥪', prop: 'grill', end: 'flip', to: 'mid' } },
      { a: { do: 'fry', e: '🥪', prop: 'grill', end: 'flip', to: 'mid' },   b: { do: 'pour', e: '🥛', liquid: '#FFF4DC', n: 2, drizzle: true } },   // susu kental manis
      { extra: true, a: { do: 'shake', e: '🍫', dots: '#5A3A22', n: 3 },   b: { do: 'shake', e: '🧀', dots: '#FFE27A', n: 3 } },                    // meses; parutan keju
      { a: { do: 'chop', e: '🍌', n: 3, to: 'mid' },                       b: { do: 'fetch', e: '🍯', jars: ['🍯', '🧂', '🌶️'], to: 'mid' } },
      { a: { do: 'taste' }, b: { do: 'taste' } }] },
    klepon: { e: '🍡', art: 'klepon', vessel: 'bowl', mix: '$c', stir: 'swish', plate: 'leaf', gag: 'squirt', beats: [   // Klepon: rolled, a secret sugar inside, boiled till they float
      { a: { do: 'pick', choices: ['🍃', '🍠', '🍓'], paint: ['#5DBB63', '#9B6BC9', '#F28DB2'] }, b: { do: 'pour', e: '💧', liquid: '#8FD3F4', n: 3 } },   // pandan / ubi ungu / stroberi
      { a: { do: 'stir', n: 4 },                                            b: { do: 'fetch', e: '🍚', jars: ['🍚', '🧂', '🌶️'], to: 'mid' } },   // the dough turns her colour; rice flour
      { a: { do: 'ball', e: 'klepon', fill: '#7A4320', n: 3, to: 'stay' }, b: { do: 'ball', e: 'klepon', fill: '#7A4320', n: 4, to: 'stay' } },   // gula merah inside
      { serve: 'plate', a: { do: 'fry', e: 'klepon', prop: 'boil', end: 'out', to: 'mid' }, b: { do: 'fry', e: 'klepon', prop: 'boil', end: 'out', to: 'mid' } },   // onto a banana leaf
      { extra: true, a: { do: 'shake', e: '🥥', dots: '#FFFFFF', n: 3 },   b: { do: 'shake', e: '🥥', dots: '#FFFFFF', n: 3 } },                    // kelapa parut
      { a: { do: 'taste' }, b: { do: 'taste' } }] },
    kering: { e: '🍪', vessel: 'bowl', mix: '#F3D9A4', stir: 'swish', shape: true, gag: 'crunch', beats: [   // Kue Kering: her cutter's shape
      { a: { do: 'pick', choices: ['❤️', '🌙', '🌸'] },                     b: { do: 'crack', e: '🥚', n: 2, to: 'mid' } },                         // hati / bulan / bunga
      { extra: true, a: { do: 'stir', n: 4 },                               b: { do: 'stir', n: 4 } },
      { a: { do: 'roll', e: '$', n: 3, to: 'stay' },                        b: { do: 'roll', e: '$', n: 4, to: 'stay' } },                          // the cutter is her shape
      { serve: 'plate', a: { do: 'fry', e: '$', prop: 'oven', end: 'out', to: 'mid' }, b: { do: 'fry', e: '$', prop: 'oven', end: 'out', to: 'mid' } },
      { a: { do: 'squeeze', prop: 'bag', e: '🍬', liquid: '#FFFFFF', out: 'dots', n: 3 }, b: { do: 'shake', e: '🍬', dots: 'rainbow', n: 3 } },   // she pipes icing
      { a: { do: 'taste' }, b: { do: 'taste' } }] },
    lapis: { e: '🍰', art: 'lapis', vessel: 'bowl', stir: 'swish', batter: 'dish', gag: 'peel', beats: [   // Kue Lapis: our stripes, as we tap
      { a: { do: 'pick', choices: ['🍓', '🍃', '🍫'], paint: ['#F28DB2', '#5DBB63', '#8B5A3C'] }, b: { do: 'fetch', e: '🥥', jars: ['🥥', '🧂', '🌶️'], to: 'mid' } },   // merah muda / pandan / cokelat; santan
      { serve: 'tin', a: { do: 'stir', n: 4 },                              b: { do: 'stir', n: 4 } },                                              // the empty tin slides in at the merge
      { steam: true, a: { do: 'pour', e: '$', liquid: '$c', n: 3 },         b: { do: 'pour', e: '🥥', liquid: '#FFF8EE', n: 3 } },                 // one stripe per tap, in tap order; then the steam lid
      { extra: true, steam: true, a: { do: 'pour', e: '$', liquid: '$c', n: 3 }, b: { do: 'pour', e: '🥥', liquid: '#FFF8EE', n: 3 } },
      { a: { do: 'taste' }, b: { do: 'taste' } }] },
    /* ---- cold treats (v3) ---- */
    lilin: { e: '🍭', art: 'lolly', vessel: 'blender', mix: '$c', taste: 'cold', gag: 'tongue', beats: [   // Es Lilin: wiggle, wiggle, pop!
      { a: { do: 'pick', choices: ['🍉', '🍇', '🍫'], paint: ['#F2677A', '#9B6BC9', '#8B5A3C'] }, b: { do: 'fetch', e: '🥛', jars: ['🥛', '🧂', '🌶️'], to: 'mid' } },   // semangka / anggur / cokelat
      { extra: true, a: { do: 'chop', e: '$', n: 3, to: 'mid' },            b: { do: 'chop', e: '$', n: 4, to: 'mid' } },
      { a: { do: 'blend', n: 3 },                                           b: { do: 'blend', n: 3 } },
      { serve: 'plate', a: { do: 'fry', e: 'lolly', prop: 'fridge', end: 'out', to: 'stay' }, b: { do: 'fry', e: 'lolly', prop: 'fridge', end: 'out', to: 'stay' } },
      { a: { do: 'pop', e: 'lolly', n: 3, to: 'mid' },                      b: { do: 'pop', e: 'lolly', n: 4, to: 'mid' } },
      { a: { do: 'taste' }, b: { do: 'taste' } }] },
    cendol: { e: '🍹', art: 'cendol', vessel: 'bowl', mix: '$c', stir: 'swish', taste: 'cold', gag: 'worm', beats: [   // Es Cendol: squeeze out the worms
      { a: { do: 'pour', e: '💧', liquid: '#8FD3F4', n: 3 },                b: { do: 'pound', e: '🍃', n: 4, to: 'mid' } },                         // water; he pounds pandan leaves
      { a: { do: 'pick', choices: ['🍃', '🍓', '🥭'], paint: ['#5DBB63', '#F28DB2', '#F7B23A'] }, b: { do: 'stir', n: 4 } },                       // pandan / stroberi / mangga
      { serve: 'glass', a: { do: 'squeeze', prop: 'press', e: 'worms', n: 3, to: 'mid' }, b: { do: 'squeeze', prop: 'press', e: 'worms', n: 4, to: 'mid' } },
      { a: { do: 'pour', e: '🥥', liquid: '#FFF8EE', n: 3 },                b: { do: 'pour', e: '🍯', liquid: '#7A4320', n: 2 } },                 // santan; gula merah
      { extra: true, a: { do: 'garnish', e: '❄️' },                          b: { do: 'garnish', e: '❄️' } },                                        // ice, clink
      { a: { do: 'taste' }, b: { do: 'taste' } }] },
    kepal: { e: '🍨', vessel: 'glass', stir: 'clink', taste: 'cold', gag: 'freeze', beats: [   // Es Kepal: pack a snowball, drown it
      { a: { do: 'pick', choices: ['🍫', '🍓', '🍈'], paint: ['#6B4226', '#E8455A', '#9BCB5A'] }, b: { do: 'garnish', e: '❄️' } },              // milo / stroberi / melon syrup; shaved ice
      { a: { do: 'ball', e: 'kepal', n: 3, to: 'mid' },                     b: { do: 'ball', e: 'kepal', n: 4, to: 'mid' } },                       // two snowballs in her colour
      { a: { do: 'pour', e: '🍫', liquid: '#5A3A22', n: 2, drizzle: true }, b: { do: 'pour', e: '🥛', liquid: '#FFF4DC', n: 2, drizzle: true } },
      { extra: true, a: { do: 'shake', e: '🍬', dots: 'rainbow', n: 3 },   b: { do: 'shake', e: '🍫', dots: '#5A3A22', n: 3 } },
      { a: { do: 'garnish', e: '🍒' },                                      b: { do: 'fetch', e: '🍪', jars: ['🍪', '🧂', '🌶️'], to: 'mid' } },
      { a: { do: 'taste' }, b: { do: 'taste' } }] },
    salad: { e: '🍇', vessel: 'bowl', stir: 'swish', batter: 'toss', taste: 'cold', beats: [   // Salad Buah: creamy dressing and a cheese storm (its stir is a toss of the fruit)
      { a: { do: 'wash', e: '🍎', n: 3, to: 'stay' },                      b: { do: 'wash', e: '🍈', n: 3, to: 'stay' } },
      { a: { do: 'chop', e: '🍎', n: 3, to: 'mid' },                       b: { do: 'chop', e: '🍈', n: 4, to: 'mid' } },
      { a: { do: 'pick', choices: ['🍓', '🥭', '🍉'] },                     b: { do: 'squeeze', prop: 'bag', e: '🥛', liquid: '#FFF8EE', out: 'drizzle', n: 2 } },   // her fruit; the dressing
      { extra: true, a: { do: 'stir', n: 3 },                               b: { do: 'stir', n: 3 } },                                              // a toss (nothing is cleared)
      { a: { do: 'shake', e: '🧀', dots: '#FFE27A', n: 3 },                b: { do: 'shake', e: '🧀', dots: '#FFE27A', n: 3 } },                  // a cheese storm, both
      { a: { do: 'taste' }, b: { do: 'taste' } }] },
  };
  // The menu's three groups (no words on screen: an icon and a colour). Display order = this order.
  var GROUPS = [
    { id: 'meal', e: '🍚', tone: 'leaf', name: 'Meals', ids: ['ceplok', 'goreng', 'sate', 'sop', 'mie', 'bubur', 'gado', 'pizza'] },
    { id: 'sweet', e: '🍭', tone: 'berry', name: 'Sweets', ids: ['pisang', 'martabak', 'cake', 'donat', 'roti', 'klepon', 'kering', 'lapis'] },
    { id: 'cold', e: '❄️', tone: 'sea', name: 'Cold treats', ids: ['campur', 'jus', 'puding', 'eskrim', 'lilin', 'cendol', 'kepal', 'salad'] },
  ];
  var MENU = [].concat.apply([], GROUPS.map(function (g) { return g.ids; }));   // 24 ids: display order, and the v3 medal order
  // the v2 medal order (v2's LIST is built from it): NEVER edit
  var MENU_V2 = ['ceplok', 'goreng', 'sate', 'sop', 'mie', 'bubur', 'gado', 'pizza', 'pisang', 'martabak', 'cake', 'donat', 'campur', 'jus', 'puding', 'eskrim'];
  var MENU_V1 = ['ceplok', 'pisang', 'goreng', 'sate', 'sop', 'martabak', 'campur', 'cake'];   // the v1 medal order: NEVER edit
  var GROUP_OF = {};
  GROUPS.forEach(function (g) { g.ids.forEach(function (id) { GROUP_OF[id] = g; }); });
  var START = ['ceplok', 'pisang'];
  // the dish names live only here and in aria-labels (nothing on screen is words)
  var NAMES = { ceplok: 'Telur Ceplok', pisang: 'Pisang Goreng', goreng: 'Nasi Goreng', sate: 'Sate Ayam', sop: 'Sayur Sop',
    martabak: 'Martabak Manis', campur: 'Es Campur', cake: 'Birthday cake', mie: 'Mie Goreng', bubur: 'Bubur Ayam',
    gado: 'Gado-Gado', pizza: 'Pizza', donat: 'Donat', jus: 'Jus Buah', puding: 'Puding', eskrim: 'Es Krim',
    roti: 'Roti Bakar', klepon: 'Klepon', kering: 'Kue Kering', lapis: 'Kue Lapis',
    lilin: 'Es Lilin', cendol: 'Es Cendol', kepal: 'Es Kepal', salad: 'Salad Buah' };

  /* ---------------------------------------------------------- the jobs */

  var GAP = 0.16, CRACK_GAP = 0.22, PICK_GAP = 0.25, JAR_GAP = 0.4;   // seconds between counted taps on one board
  var LATCH = 0.45;               // the pan turns golden: this board ignores taps this long (only this board)
  var COOK_S = [3, 2.2, 1.6];     // seconds a side takes to turn golden by itself, by help level
  var TAPS = { few: -1, normal: 0, lots: 2 };

  // kind: work/fetch/cook results fly into the dish at the merge; add/pick deliver piece by piece.
  var VERBS = {
    wash: { kind: 'work', icon: '💦' }, peel: { kind: 'work' }, chop: { kind: 'work', icon: '🔪' }, pound: { kind: 'work' },
    crack: { kind: 'work', gap: CRACK_GAP }, skewer: { kind: 'work', fixed: 3 }, stir: { kind: 'work', icon: '🥄' },
    roll: { kind: 'work', icon: '🍩' }, blend: { kind: 'work', icon: '🌀' },
    spread: { kind: 'work', icon: '🍞' }, ball: { kind: 'work', icon: '🤲' }, squeeze: { kind: 'work', icon: '💦' }, pop: { kind: 'work', icon: '🍭' },
    pour: { kind: 'add' }, shake: { kind: 'add' }, garnish: { kind: 'add', fixed: 3 }, scoop: { kind: 'add', fixed: 2 },
    fry: { kind: 'cook', fixed: 1 },
    fetch: { kind: 'fetch', fixed: 1, gap: JAR_GAP },
    pick: { kind: 'pick', fixed: 3, gap: PICK_GAP },
    taste: { kind: 'end', fixed: 1, icon: '😋' }, blow: { kind: 'end', fixed: 3, icon: '💨' },
  };

  var LIQUID = { '🍶': '#4A2A17', '🍯': '#E8A33A', '🥛': '#FFFFFF', '🥥': '#FFF8EE', '🍋': '#F7E36A' };   // a fetched item that lands as liquid
  var SAUCE = { '🥜': '#A0642D', '🌶️': '#D9452B', '🍅': '#D9452B', '🥔': '#EAD7A0', '🍃': '#5DBB63' };   // (tomato sauce; the mashed potato; pounded pandan)
  var RAINBOW = ['#E8455A', '#F7D35C', '#7BC96F', '#4FA3E0', '#B07CD8'];
  var PEEL = { '🍌': '#F7D35C', '🥔': '#B07A4A' };
  var FACES = ['😋', '🤤', '😍', '🥰'];
  var HELPERS = { cat: '🐈', hen: '🐔', radio: '📻', herbs: '🌿', cicak: '🦎' };
  var HELPER_IDS = ['cat', 'hen', 'radio', 'herbs', 'cicak'];
  var TOKENS = ['klepon', 'kepal', 'worms', 'lolly'];   // drawn in CSS in her colour (tokenEl), never text

  /* ---------------------------------------------------------- presents */

  // The first gift list, exactly as v1 shipped it: a save made before the bigger menu keeps what it gave. NEVER edit.
  var GIFTS_V1 = [
    { kind: 'recipe', id: 'goreng' },
    { kind: 'helper', id: 'cat', e: '🐈' },
    { kind: 'recipe', id: 'sate' },
    { kind: 'tier', n: 1, e: '🌷' },
    { kind: 'recipe', id: 'sop' },
    { kind: 'helper', id: 'hen', e: '🐔' },
    { kind: 'recipe', id: 'martabak' },
    { kind: 'tier', n: 2, e: '💡' },
    { kind: 'recipe', id: 'campur' },
    { kind: 'helper', id: 'radio', e: '📻' },
    { kind: 'recipe', id: 'cake' },
    { kind: 'tier', n: 3, e: '🏮' },
    { kind: 'helper', id: 'herbs', e: '🌿' },
  ];
  // v2: one present per finished dish for new kitchens, in this order. Frozen once shipped (a later content drop
  // adds a v3 list and a second legacy count; it never edits this one).
  var GIFTS = [
    { kind: 'recipe', id: 'goreng' },            //  0
    { kind: 'helper', id: 'cat', e: '🐈' },      //  1
    { kind: 'recipe', id: 'pizza' },             //  2  a kid favourite early
    { kind: 'tier', n: 1, e: '🌷' },             //  3
    { kind: 'recipe', id: 'sate' },              //  4
    { kind: 'recipe', id: 'donat' },             //  5
    { kind: 'helper', id: 'hen', e: '🐔' },      //  6
    { kind: 'recipe', id: 'sop' },               //  7
    { kind: 'recipe', id: 'eskrim' },            //  8
    { kind: 'tier', n: 2, e: '💡' },             //  9
    { kind: 'recipe', id: 'mie' },               // 10
    { kind: 'recipe', id: 'martabak' },          // 11
    { kind: 'helper', id: 'radio', e: '📻' },    // 12
    { kind: 'recipe', id: 'jus' },               // 13
    { kind: 'recipe', id: 'gado' },              // 14
    { kind: 'tier', n: 3, e: '🏮' },             // 15
    { kind: 'recipe', id: 'campur' },            // 16
    { kind: 'recipe', id: 'puding' },            // 17
    { kind: 'recipe', id: 'bubur' },             // 18
    { kind: 'recipe', id: 'cake' },              // 19  still the capstone recipe
    { kind: 'helper', id: 'herbs', e: '🌿' },    // 20
  ];
  var DECOR = ['🌻', '🧺', '🍵', '🏺', '🎐', '🍍'];   // NEVER edit
  var MEDALS = 2;                 // gold medals per recipe
  // v3: one present per finished dish for NEW kitchens. Frozen once shipped: a later content drop adds a v4 list and a
  // `legacy3`, never edits this one. The cicak and tier 4 come after the last new dish, so a family that already had
  // every v2 dish, helper and tier gets the 8 new dishes first.
  var GIFTS3 = [
    { kind: 'recipe', id: 'goreng' },            //  0
    { kind: 'helper', id: 'cat', e: '🐈' },      //  1
    { kind: 'recipe', id: 'pizza' },             //  2
    { kind: 'recipe', id: 'lilin' },             //  3  a new dish early
    { kind: 'tier', n: 1, e: '🌷' },             //  4
    { kind: 'recipe', id: 'sate' },              //  5
    { kind: 'recipe', id: 'roti' },              //  6
    { kind: 'helper', id: 'hen', e: '🐔' },      //  7
    { kind: 'recipe', id: 'donat' },             //  8
    { kind: 'recipe', id: 'sop' },               //  9
    { kind: 'recipe', id: 'eskrim' },            // 10
    { kind: 'tier', n: 2, e: '💡' },             // 11
    { kind: 'recipe', id: 'kering' },            // 12
    { kind: 'recipe', id: 'mie' },               // 13
    { kind: 'recipe', id: 'klepon' },            // 14
    { kind: 'recipe', id: 'martabak' },          // 15
    { kind: 'helper', id: 'radio', e: '📻' },    // 16
    { kind: 'recipe', id: 'jus' },               // 17
    { kind: 'recipe', id: 'kepal' },             // 18
    { kind: 'recipe', id: 'gado' },              // 19
    { kind: 'tier', n: 3, e: '🏮' },             // 20
    { kind: 'recipe', id: 'campur' },            // 21
    { kind: 'recipe', id: 'cendol' },            // 22
    { kind: 'recipe', id: 'puding' },            // 23
    { kind: 'recipe', id: 'lapis' },             // 24
    { kind: 'recipe', id: 'salad' },             // 25  the last new dish
    { kind: 'helper', id: 'cicak', e: '🦎' },    // 26
    { kind: 'recipe', id: 'bubur' },             // 27
    { kind: 'tier', n: 4, e: '🚩' },             // 28
    { kind: 'recipe', id: 'cake' },              // 29  still the capstone recipe
    { kind: 'helper', id: 'herbs', e: '🌿' },    // 30
  ];

  /* ---------------------------------------------------------- pure rules */

  var clamp = function (v, lo, hi) { return Math.max(lo, Math.min(hi, v)); };

  function dress(g) { return g.kind === 'recipe' ? { kind: 'recipe', id: g.id, e: RECIPES[g.id].e } : g; }
  function giftKey(g) { return g.kind + ':' + (g.kind === 'tier' ? g.n : g.kind === 'decor' ? g.e : g.kind === 'medal' ? g.id + ':' + g.k : (g.id || '')); }
  /** Gift i of the first (v1) list, exactly as v1 gave it. */
  function giftV1(i) {
    if (i < GIFTS_V1.length) return dress(GIFTS_V1[i]);
    var k = i - GIFTS_V1.length;
    if (k < DECOR.length) return { kind: 'decor', e: DECOR[k] };
    k -= DECOR.length;
    if (k < MENU_V1.length * MEDALS) { var id = MENU_V1[k % MENU_V1.length]; return { kind: 'medal', id: id, k: Math.floor(k / MENU_V1.length) + 1, e: RECIPES[id].e }; }
    return { kind: 'thanks', e: '⭐' };
  }
  var V1_LEN = GIFTS_V1.length + DECOR.length + MENU_V1.length * MEDALS;   // 35
  /** Two rounds of gold medals over a menu (round 1 for every dish, then round 2). */
  function medals(menu) {
    return [1, 2].reduce(function (out, r) { return out.concat(menu.map(function (id) { return { kind: 'medal', id: id, k: r, e: RECIPES[id].e }; })); }, []);
  }
  function decor(e) { return { kind: 'decor', e: e }; }
  // the v2 sequence: the gift list, then the shelf decorations, then two rounds of medals (59 in all); then thanks.
  // Built from the frozen MENU_V2, NEVER from MENU (that would reorder v2's medals for every old save).
  var LIST = GIFTS.map(dress).concat(DECOR.map(decor)).concat(medals(MENU_V2));
  // the v3 sequence: 31 + 6 + 48 = 85
  var LIST3 = GIFTS3.map(dress).concat(DECOR.map(decor)).concat(medals(MENU));
  var THANKS = { kind: 'thanks', e: '⭐' };
  var rests = {};
  /** What a save with `legacy` v1 presents gets next: the v2 list minus what v1 already gave (memoised). */
  function restAfter(legacy) {
    var L = clamp(Math.floor(Number(legacy)) || 0, 0, V1_LEN);
    if (!rests[L]) {
      var had = {};
      for (var i = 0; i < L; i++) had[giftKey(giftV1(i))] = true;
      rests[L] = LIST.filter(function (g) { return !had[giftKey(g)]; });
    }
    return rests[L];
  }
  /** Gift i under the v2 rules (exactly as v2 shipped them): v1's first `legacy`, then the v2 list minus what v1 gave. */
  function giftV2(i, legacy) { legacy = legacy || 0; return i < legacy ? giftV1(i) : restAfter(legacy)[i - legacy] || THANKS; }
  var rests3 = {};
  /** What a save gets after its first `legacy2` presents (v1 rules for the first `legacy`, then v2 rules): LIST3 minus
   *  everything it was given. Past v1's and v2's ends there were only stars, so the key is bounded (memoised). */
  function restAfter3(legacy, legacy2) {
    var L1 = Math.max(0, Math.floor(Number(legacy)) || 0), L2 = Math.max(L1, Math.floor(Number(legacy2)) || 0);
    var n1 = Math.min(L1, V1_LEN), r = restAfter(L1), n2 = Math.min(L2 - L1, r.length), key = n1 + ':' + n2;
    if (!rests3[key]) {
      var had = {};
      for (var i = 0; i < n1; i++) had[giftKey(giftV1(i))] = true;
      for (var j = 0; j < n2; j++) had[giftKey(r[j])] = true;
      rests3[key] = LIST3.filter(function (g) { return !had[giftKey(g)]; });
    }
    return rests3[key];
  }
  /** The present for finishing dish number i (0 = the first): the old rules for the first `legacy2`, then the rest of v3. */
  function giftFor(i, legacy, legacy2) {
    legacy = legacy || 0; legacy2 = Math.max(legacy, legacy2 || 0);
    return i < legacy2 ? giftV2(i, legacy) : restAfter3(legacy, legacy2)[i - legacy2] || THANKS;
  }

  /** What `done` finished dishes have unlocked. Worked out from the counts, never stored. */
  function unlocks(done, legacy, legacy2) {
    done = Math.max(0, Math.floor(Number(done)) || 0);
    legacy = Math.max(0, Math.min(done, Math.floor(Number(legacy)) || 0));
    legacy2 = Math.max(legacy, Math.min(done, Math.floor(Number(legacy2)) || 0));
    var have = {}, rank = {}, u = { recipes: [], helpers: {}, tier: 0, decor: [], medals: {}, next: null, nextIn: 0, rank: rank };
    START.forEach(function (id) { have[id] = true; rank[id] = -1; });
    for (var i = 0; i < done; i++) {
      var g = giftFor(i, legacy, legacy2);
      if (g.kind === 'recipe') { have[g.id] = true; rank[g.id] = i; }
      else if (g.kind === 'helper') u.helpers[g.id] = true;
      else if (g.kind === 'tier') u.tier = Math.max(u.tier, g.n);
      else if (g.kind === 'decor' && u.decor.indexOf(g.e) < 0) u.decor.push(g.e);
      else if (g.kind === 'medal') u.medals[g.id] = (u.medals[g.id] || 0) + 1;
    }
    u.recipes = MENU.filter(function (id) { return have[id]; });
    for (var j = done; j < done + LIST3.length; j++) {
      var n = giftFor(j, legacy, legacy2);
      if (n.kind === 'thanks') break;
      if (n.kind === 'recipe') { u.next = n.id; u.nextIn = Math.min(3, j - done + 1); break; }
    }
    return u;
  }

  /** A saved kitchen, checked and repaired: anything odd becomes something sensible. A v1 or v2 save keeps everything
   *  it had (`legacy` = its v1 count, `legacy2` = its count under the old rules) and gets the new dishes next. */
  function cleanKitchen(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) raw = {};
    var num = function (v, lo, hi, d) {
      if (v === null || v === '' || typeof v === 'boolean' || typeof v === 'object') return d;
      v = Number(v);
      return isFinite(v) ? Math.max(lo, Math.min(hi, Math.floor(v))) : d;
    };
    var own = function (o, k) { return Object.prototype.hasOwnProperty.call(o, k); };
    var plain = function (o) { return !!o && typeof o === 'object' && !Array.isArray(o); };
    var done = num(raw.done, 0, 9999, 0);
    var v3 = raw.v === 3 || own(raw, 'legacy2');
    var v2 = v3 || raw.v === 2 || own(raw, 'legacy');
    var legacy = v2 ? num(raw.legacy, 0, done, 0) : done;              // v1: everything it had came from the v1 list
    var legacy2 = v3 ? num(raw.legacy2, legacy, done, legacy) : done;   // v1/v2: everything it had came from the old rules
    var u = unlocks(done, legacy, legacy2), cooked = {}, made = {};
    if (plain(raw.cooked)) u.recipes.forEach(function (id) { if (own(raw.cooked, id)) { var n = num(raw.cooked[id], 0, 999, 0); if (n) cooked[id] = n; } });
    if (v2) { if (plain(raw.made)) u.recipes.forEach(function (id) { if (own(raw.made, id)) { var m = num(raw.made[id], 0, 7, 0); if (m) made[id] = m; } }); }
    else Object.keys(cooked).forEach(function (id) { made[id] = [0, 1, 3, 7][Math.min(3, cooked[id])]; });   // v1 stars -> as many variant marks
    var seen = [], SEEN_X = ['fridge', 'boil', 'bag'];
    if (Array.isArray(raw.seen)) raw.seen.forEach(function (v) { if (typeof v === 'string' && (own(VERBS, v) || SEEN_X.indexOf(v) >= 0) && seen.indexOf(v) < 0) seen.push(v); });
    return { v: 3, done: done, legacy: legacy, legacy2: legacy2, cooked: cooked, made: made, chicks: num(raw.chicks, 0, 3, 0), seen: seen };
  }

  /** Taps a job takes: fixed jobs never change; others follow the Taps option and the little player's help. */
  function nFor(job, help, taps) {
    var v = VERBS[job.do];
    if (v && v.fixed != null) return v.fixed;
    return clamp((job.n || 3) + (TAPS[taps] || 0) - (help || 0), 1, 8);
  }

  /** The beats of a recipe: Short leaves out its extra beats (one, or two for Telur Ceplok). */
  function beatsFor(recipe, length) {
    return recipe.beats.filter(function (b) { return length !== 'short' || !b.extra; });
  }

  /** What a job makes. */
  function resultOf(job) { return job.do === 'crack' ? '🍳' : job.do === 'skewer' ? '🍢' : job.do === 'roll' && job.base ? 'base' : job.do === 'spread' ? '🥪' : job.e; }

  /** A recipe's one choice: her pick (its choices are the dish's three variants). */
  function pickOf(recipe) {
    var pk = null;
    if (recipe) recipe.beats.forEach(function (bt) { if (bt.a.do === 'pick') pk = bt.a; });
    return pk;
  }
  /** A job with the variant tokens filled in: '$' = choices[V], '$c' = paint[V] (a shallow copy; the data stays as written). */
  function resolveJob(job, pk, V) {
    if (!job || !pk) return job;
    var out = {}, c = pk.paint ? pk.paint[V] : '#FFF4E0';
    Object.keys(job).forEach(function (k) {
      var v = job[k];
      if (v === '$') v = pk.choices[V];
      else if (v === '$c') v = c;
      out[k] = v;
    });
    return out;
  }

  /** Blend two #RRGGBB colours (t = 0..1). */
  function mixColor(a, b, t) {
    var pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16), out = '#';
    [16, 8, 0].forEach(function (sh) {
      var x = Math.round(((pa >> sh) & 255) * (1 - t) + ((pb >> sh) & 255) * t);
      out += (x < 16 ? '0' : '') + x.toString(16);
    });
    return out;
  }

  // where things sit: % of the board object (mud, chop pieces) and of the dish's food area
  var MUD = [[28, 34], [64, 26], [44, 62], [70, 60], [24, 66], [54, 42], [38, 20], [76, 42]];
  var SPREAD = [[-0.17, -0.1], [0.17, -0.1], [0, 0.12], [-0.25, 0.14], [0.25, 0.14], [0, -0.24]];
  var PILE = [[-0.07, 0.02], [0.07, 0.02], [0, -0.06], [-0.11, 0.08], [0.11, 0.08], [0, 0.1]];
  var CSLOTS = [[50, 56], [30, 46], [70, 46], [36, 72], [64, 72], [50, 32], [18, 64], [82, 64]];
  var RSLOTS = [[6, 58], [94, 58], [20, 22], [80, 22], [22, 90], [78, 90]];
  var BSLOTS = [[28, 82], [72, 82]];   // sauces sit at the front of the dish, beside the food (not under it)

  /* ---------------------------------------------------------- the game */

  MG.registerGame({
    id: 'kitchen',
    name: 'Little Kitchen',
    emoji: '🍳',
    color: 'tangerine',
    howTo: 'Cook real home dishes together. Pick a dish (the coloured tabs sort them: meals, sweets, cold treats). Then each of you does the job on your own side (crack, wash, chop, roll, spread, roll a ball, squeeze, pop a lolly, stir, fry, or find the right jar) and it all goes into the dish in the middle. The next step comes when you are both done. Once in every dish she chooses a topping, flavour or shape; every choice is right, and the menu shows which ones you have made. Taste it together at the end. Every dish brings a present: new recipes, kitchen helpers, a nicer kitchen. Your kitchen is kept for next time.',
    options: [
      { key: 'length', label: 'Recipe', default: 'full', choices: [
        { value: 'short', label: 'Short', emoji: '🐇' }, { value: 'full', label: 'Full', emoji: '🍲' }] },
      { key: 'taps', label: 'Taps per step', default: 'normal', choices: [
        { value: 'few', label: 'Few', emoji: '🐣' }, { value: 'normal', label: 'Normal', emoji: '🥄' }, { value: 'lots', label: 'Lots', emoji: '💪' }] },
    ],

    mount: function (root, ctx) {
      var el = ctx.el, sfx = ctx.sfx, fx = ctx.fx, util = ctx.util;
      var RM = !!MG.reducedMotion;
      var LEN = ctx.opt('length'), TAPOPT = ctx.opt('taps');
      var players = ctx.players;
      // roles are fixed for the round: "a" (short showy jobs) goes to the little player if exactly one is little
      var aSide = players[0].little !== players[1].little ? (players[0].little ? 0 : 1) : ctx.firstPlayer;
      var bSide = 1 - aSide;

      var raw = ctx.load('kitchen', null);   // (kept: a v1/v2 save gets the new-menu sparkle once)
      var kit = cleanKitchen(raw);
      var u = unlocks(kit.done, kit.legacy, kit.legacy2);
      var state = 'menu', token = 0;
      var recipeId = null, recipe = null, beats = [], beatI = -1;
      var vessel = newVessel('plate');
      var catSnacks = 0, chickThisRound = false, highDone = false;
      var away = {};                  // shelf helpers out on a leap right now (only one cat on screen at a time)
      var forced = {};                       // tests: force the next surprise roll
      var events = [];                       // the last 200 counted taps (tests)
      var lastTap = [0, 0], menuTap = 0, lastHinted = null;
      var wallAt = -1, wallC = 0, fill = 0;
      var pickedChoice = null;               // the bowl she chose this round: the dish's variant (the finished dish shows it)
      var activeTab = null, tabAt = -1;      // the menu's open group tab (only when there are tabs), the last tab tap
      var smearDone = false;                 // her toast knife has flicked a blob onto her chef this round
      var news = null;                       // the group the once-only "new menu" sparkle points at (tests)

      /* ---- sounds: the kitchen's own, built from tones and noise (soft) ---- */

      var S = {
        tok: function (k) { var f = 240 + 24 * (k || 0); sfx.tone({ freq: f, to: f * 0.46, dur: 0.08, type: 'triangle', gain: 0.25 }); sfx.noise({ freq: 2000, dur: 0.03, gain: 0.1 }); },
        dug: function () { sfx.tone({ freq: 150, to: 55, dur: 0.12, type: 'sine', gain: 0.3 }); sfx.noise({ freq: 200, dur: 0.06, gain: 0.12 }); },
        krk: function () { sfx.noise({ freq: 4000, dur: 0.04, gain: 0.14 }); sfx.noise({ freq: 4000, dur: 0.04, gain: 0.14, delay: 0.06 }); },
        shhk: function () { sfx.noise({ freq: 3000, to: 1200, dur: 0.12, gain: 0.12, q: 0.8 }); },
        squeak: function (k) { sfx.tone({ freq: 600 + 80 * k, to: 900 + 80 * k, dur: 0.08, type: 'sine', gain: 0.12 }); },
        glug: function () { sfx.tone({ freq: 300, to: 200, dur: 0.08, type: 'sine', gain: 0.2 }); sfx.tone({ freq: 260, to: 160, dur: 0.08, type: 'sine', gain: 0.2, delay: 0.1 }); },
        swish: function () { sfx.noise({ freq: 700, to: 1500, dur: 0.15, gain: 0.1 }); },
        sizzle: function (g) { sfx.noise({ freq: 5000, dur: 0.12, gain: g || 0.03, q: 0.5 }); },
        clink: function () { sfx.tone({ freq: 2000, dur: 0.05, type: 'sine', gain: 0.1 }); sfx.tone({ freq: 2600, dur: 0.05, type: 'sine', gain: 0.1, delay: 0.04 }); },
        sneeze: function () { sfx.tone({ freq: 400, to: 600, dur: 0.12, type: 'sine', gain: 0.2 }); sfx.tone({ freq: 450, to: 750, dur: 0.12, type: 'sine', gain: 0.2, delay: 0.15 }); sfx.noise({ freq: 3000, dur: 0.2, gain: 0.2, delay: 0.35 }); },
        peep: function () { sfx.tone({ freq: 1800, to: 2200, dur: 0.06, type: 'sine', gain: 0.12 }); sfx.tone({ freq: 1800, to: 2200, dur: 0.06, type: 'sine', gain: 0.12, delay: 0.1 }); },
        cluck: function () { sfx.noise({ freq: 900, dur: 0.05, gain: 0.15 }); sfx.noise({ freq: 900, dur: 0.05, gain: 0.15, delay: 0.1 }); sfx.tone({ freq: 500, to: 400, dur: 0.06, type: 'triangle', gain: 0.12 }); },
        purr: function () { for (var i = 0; i < 6; i++) sfx.noise({ freq: 120, dur: 0.05, gain: 0.08, delay: i * 0.06 }); },
        meow: function () { sfx.tone({ freq: 700, to: 500, dur: 0.25, type: 'triangle', gain: 0.12 }); },
        mmm: function () { sfx.tone({ freq: 262, to: 247, dur: 0.4, type: 'sine', gain: 0.12 }); },
        fuu: function () { sfx.noise({ freq: 900, to: 400, dur: 0.3, gain: 0.1 }); },
        brr: function () { sfx.tone({ freq: 180, to: 170, dur: 0.3, type: 'triangle', gain: 0.1 }); },
        birthday: function () { sfx.seq([67, 67, 69, 67, 72, 71], { step: 0.2, type: 'triangle', gain: 0.2 }); },
        tune: function () { sfx.seq([72, 76, 79], { step: 0.16, type: 'sine', gain: 0.14 }); },
        fwump: function () { sfx.noise({ freq: 500, to: 180, dur: 0.12, gain: 0.12, q: 0.7 }); sfx.tone({ freq: 170, to: 120, dur: 0.1, type: 'triangle', gain: 0.1 }); },
        chk: function () { sfx.tone({ freq: 1200, to: 700, dur: 0.05, type: 'triangle', gain: 0.12 }); },
        whirr: function (k) { sfx.noise({ freq: 600 + 80 * k, to: 1500 + 80 * k, dur: 0.35, gain: 0.08, q: 1.5 }); sfx.tone({ freq: 110, to: 150, dur: 0.3, type: 'triangle', gain: 0.06 }); },
        smear: function () { sfx.noise({ freq: 1400, to: 700, dur: 0.14, gain: 0.1, q: 0.9 }); },
        pat: function (k) { sfx.tone({ freq: 220 + 30 * (k || 0), to: 160, dur: 0.07, type: 'sine', gain: 0.18 }); sfx.noise({ freq: 900, dur: 0.04, gain: 0.08 }); },
        squish: function () { sfx.noise({ freq: 300, to: 120, dur: 0.16, gain: 0.14, q: 1 }); sfx.tone({ freq: 260, to: 180, dur: 0.12, type: 'sine', gain: 0.1 }); },
        thwop: function () { sfx.tone({ freq: 180, to: 640, dur: 0.09, type: 'sine', gain: 0.22 }); },
        blub: function () { sfx.tone({ freq: 300, to: 500, dur: 0.06, type: 'sine', gain: 0.08 }); },
        cek: function () { for (var i = 0; i < 3; i++) sfx.tone({ freq: 2600, to: 2200, dur: 0.03, type: 'triangle', gain: 0.06, delay: i * 0.09 }); },
        splat: function () { sfx.noise({ freq: 1200, to: 300, dur: 0.12, gain: 0.14 }); sfx.tone({ freq: 500, to: 200, dur: 0.1, type: 'sine', gain: 0.1 }); },
        crunch: function () { [0, 0.07, 0.14].forEach(function (d) { sfx.noise({ freq: 2500, dur: 0.05, gain: 0.15, delay: d }); }); },
        sret: function () { sfx.noise({ freq: 1800, to: 900, dur: 0.15, gain: 0.1, q: 1.2 }); },
        slurp: function () { sfx.noise({ freq: 600, to: 2400, dur: 0.35, q: 2, gain: 0.1 }); },
      };

      /* ---- timers: game logic only through later(), which an old beat can never reach ---- */

      function setState(s) { state = s; token++; }
      function later(ms, fn) { var tk = token; return ctx.after(ms, function () { if (tk === token) fn(); }); }

      /* ---- the variant: what she picked this round ('$' and '$c' in the data) ---- */

      /** Her choice so far (0 until she has chosen: only a test jumping past the pick sees that). */
      function variant() { return pickedChoice != null ? pickedChoice : 0; }
      function variantColour() { var pk = pickOf(recipe); return pk && pk.paint ? pk.paint[variant()] : '#FFF4E0'; }
      function mixOf() { return recipe.mix === '$c' ? variantColour() : recipe.mix; }

      /* ---- build ---- */

      var scene = el('div', { class: 'kt-scene', hidden: true });
      var tierEl = el('div', { class: 'kt-tier', 'aria-hidden': 'true' });
      var stripEl = el('div', { class: 'kt-strip', 'aria-hidden': 'true' });
      var shelfL = el('div', { class: 'kt-shelf kt-shelf--l', 'aria-hidden': 'true' });
      var shelfR = el('div', { class: 'kt-shelf kt-shelf--r', 'aria-hidden': 'true' });
      var liqEl = el('span', { class: 'kt-liq' });
      var backEl = el('span', { class: 'kt-vback' }, liqEl);
      var frontEl = el('span', { class: 'kt-vfront' });
      var contentsEl = el('div', { class: 'kt-contents' });
      var swirlEl = el('span', { class: 'kt-swirl' }, el('i', { 'data-side': '0' }), el('i', { 'data-side': '1' }));
      var lidEl = el('span', { class: 'kt-lid-big' });
      var ovenWin = el('i');
      var ovenEl = el('span', { class: 'kt-ovendoor' }, ovenWin);   // the pizza's oven: drops over the dish, glows, lifts
      var ghostEl = el('span', { class: 'kt-ghost' });
      var windowEl = el('span', { class: 'kt-window', hidden: true, 'aria-hidden': 'true' },
        el('span', { class: 'kt-curtain kt-curtain--l' }), el('span', { class: 'kt-curtain kt-curtain--r' }), el('span', { class: 'kt-sill' }, ctx.sticker('🌷')));
      var dishEl = el('span', { class: 'kt-dish', hidden: true });
      var giftEl = el('span', { class: 'kt-gift', hidden: true });
      var vesselEl = el('div', { class: 'kt-vessel', 'data-kind': 'plate', 'aria-label': 'Dish' }, windowEl, backEl, contentsEl, swirlEl, frontEl, lidEl, ovenEl, ghostEl, dishEl, giftEl);
      var wallEl = el('div', { class: 'kt-wall' }, tierEl, stripEl, shelfL, vesselEl, shelfR);
      scene.appendChild(wallEl);
      var railEl = el('div', { class: 'kt-rail' });     // the group tabs (only when there are more than 8 cells)
      var pageEl = el('div', { class: 'kt-page' });     // the cards
      var menuEl = el('div', { class: 'kt-menu' }, railEl, pageEl);
      root.appendChild(scene);
      root.appendChild(menuEl);

      /** One board per player: the chef in the outer corner, a tick in the inner one, the job below. */
      function mkBoard(s) {
        var p = players[s];
        var face = ctx.sticker(p.emoji, 'kt-face');
        var smear = el('span', { class: 'kt-smear' }), tongue = el('span', { class: 'kt-tongue' });
        var chef = el('span', { class: 'kt-chef' }, el('span', { class: 'kt-hat' }), face, el('span', { class: 'kt-nose' }), smear, el('span', { class: 'kt-splat' }), tongue,
          el('span', { class: 'kt-wave' }, ctx.sticker('👋')));
        var check = el('span', { class: 'kt-check' }, ctx.sticker('✔️'));
        var want = el('span', { class: 'kt-want', hidden: true });
        var main = el('div', { class: 'kt-main' });
        var node = el('div', { class: 'kt-board', 'data-side': String(s), role: 'button', tabindex: '0', 'aria-label': 'Board' },
          el('div', { class: 'kt-top' }, chef, want, check), main);
        scene.appendChild(node);
        return { side: s, el: node, chef: chef, face: face, emoji: p.emoji, check: check, want: want, main: main, obj: null, parts: {}, smear: smear, tongue: tongue, tongueGen: 0,
          job: null, verb: null, n: 0, k: 0, done: false, nextAt: 0, busyUntil: 0, phase: null, heat: 0, heat2: 0,
          chosen: null, wrongRow: 0, sneezed: false, replaced: false, turns: 0,
          cheerAt: -1, tickAt: -1, munchAt: -1, sizzleAt: 0, c: 0, faceGen: 0 };
      }
      var boards = [mkBoard(0), mkBoard(1)];

      /* ---- small visual helpers (decoration only) ---- */

      function anim(node, frames, ms, o) {
        if (!node || !node.animate) return null;
        o = o || {};
        try { return node.animate(frames, { duration: RM ? Math.min(ms, 150) : ms, easing: o.easing || 'ease-out', composite: o.replace ? 'replace' : 'add', fill: o.fill || 'none' }); }
        catch (e) { return null; }
      }
      /** The object squashes: a tap that came too soon (never silent, never queued). */
      function squash(node) { anim(node, [{ transform: 'scale(1, 1)' }, { transform: 'scale(1.06, 0.9)' }, { transform: 'scale(1, 1)' }], 120); }

      /** Something flies from one element to another in an arc (decoration; the state has already changed). */
      function fly(content, fromNode, toNode, o) {
        o = o || {};
        ctx.after(o.delay || 0, function () {
          if (!fromNode || !toNode || !fromNode.isConnected || !toNode.isConnected) return;
          var r = root.getBoundingClientRect(), from = fx.centerOf(fromNode), to = fx.centerOf(toNode);
          if (o.dx) to.x += o.dx * toNode.getBoundingClientRect().width;
          if (o.dy) to.y += o.dy * toNode.getBoundingClientRect().height;
          var f = el('span', { class: 'kt-flyer', style: { left: (from.x - r.left) + 'px', top: (from.y - r.top) + 'px', fontSize: (o.size || 0) ? o.size + 'px' : null } },
            typeof content === 'string' ? flyThing(content) : content);
          root.appendChild(f);
          var ms = o.ms || 520, dx = to.x - from.x, dy = to.y - from.y;
          if (f.animate) {
            if (RM) f.animate([{ transform: 'translate(calc(-50% + ' + dx + 'px), calc(-50% + ' + dy + 'px))', opacity: 0 }, { transform: 'translate(calc(-50% + ' + dx + 'px), calc(-50% + ' + dy + 'px))', opacity: 1 }], { duration: 150, fill: 'forwards' });
            else f.animate([
              { transform: 'translate(-50%, -50%) scale(1)' },
              { transform: 'translate(calc(-50% + ' + dx * 0.5 + 'px), calc(-50% + ' + (dy * 0.5 - Math.min(90, 30 + Math.abs(dx) * 0.25)) + 'px)) scale(1.25)', offset: 0.5 },
              { transform: 'translate(calc(-50% + ' + dx + 'px), calc(-50% + ' + dy + 'px)) scale(0.8)' },
            ], { duration: ms, easing: 'ease-in-out', fill: 'forwards' });
          }
          ctx.after(RM ? 180 : ms + 30, function () { f.remove(); if (o.pop !== false) fx.pop(toNode); });
        });
      }

      /** What flies: a sticker, or the rolled pizza base, or a jelly, a scoop or a token in her colour, or (kue
       *  kering) a baked cookie of her shape. */
      function flyThing(e) {
        if (e === 'base') return el('span', { class: 'kt-flybase' });
        if (e === 'jelly') return jellyEl(variantColour());
        if (e === 'scoop') return scoopEl(variantColour());
        if (TOKENS.indexOf(e) >= 0) return tokenEl(e, variantColour());
        if (isShape(e)) return cookieEl(e, 'baked');
        return ctx.sticker(e);
      }

      /** The parts of each dish drawn in CSS (a 1em box, in her colour): klepon, kue lapis, es lilin, es cendol. */
      var ART = { klepon: ['leaf', 'ball b1', 'ball b2', 'ball b3'], lapis: ['blk', 'peel'], lolly: ['stick', 'body'], cendol: ['straw', 'glass', 'w w1', 'w w2', 'w w3', 'w w4'] };
      /** A dish's own sticker. Bubur's 🥣 is an empty bowl in the emoji fonts, so it gets its porridge across the
       *  mouth (in CSS: a cream ellipse with a few toppings). A dish with `art` is drawn in CSS in colour c (her colour
       *  on the finished dish and the taste bowls; the first variant's everywhere else). Used wherever the dish shows. */
      function dishSticker(id, cls, c) {
        var R = RECIPES[id];
        if (R.art) {
          var a = ctx.sticker('', cls);
          a.classList.add('kt-art', 'kt-art--' + R.art);
          a.style.setProperty('--c', c || pickOf(R).paint[0]);
          ART[R.art].forEach(function (k) { a.appendChild(el('i', { class: k })); });
          return a;
        }
        var s = ctx.sticker(R.e, cls);
        if (id === 'bubur') { s.classList.add('kt-bubur'); s.appendChild(el('span', { class: 'kt-porridge' })); }
        return s;
      }

      /** A token drawn in CSS in colour c (never text): klepon, a kepal snowball, cendol worms, an ice lolly. */
      var TOKEN_PARTS = { klepon: ['b1', 'b2', 'b3'], kepal: ['s'], worms: ['w1', 'w2', 'w3', 'w4'], lolly: ['stick', 'body'] };
      function tokenEl(t, c) {
        var n = el('span', { class: 'kt-tok kt-tok--' + t, style: { '--c': c || '#5DBB63' } });
        TOKEN_PARTS[t].forEach(function (k) { n.appendChild(el('i', { class: k })); });
        return n;
      }
      /** Kue kering: is this emoji her cookie cutter's shape? */
      function isShape(e) { var pk = recipe && recipe.shape ? pickOf(recipe) : null; return !!pk && pk.choices.indexOf(e) >= 0; }
      /** A cookie of her cutter's shape: a silhouette, raw or baked ('oven': both, the baked one showing as it cooks).
       *  The die-cut edge stays on the outer sticker; the filter is on the inner span. */
      function cookieEl(e, state) {
        var w = el('span', { class: 'mg-sticker kt-cookiewrap', 'aria-hidden': 'true' });
        if (state === 'oven') { w.classList.add('is-oven'); w.appendChild(el('span', { class: 'kt-cookie is-raw', text: e })); w.appendChild(el('span', { class: 'kt-cookie is-baked', text: e })); }
        else w.appendChild(el('span', { class: 'kt-cookie ' + (state === 'baked' ? 'is-baked' : 'is-raw'), text: e }));
        return w;
      }

      function burstAt(node, o) { if (!node || !node.isConnected) return; var c = fx.centerOf(node); fx.burst(c.x, c.y, o); }

      /* ---- the shelf, the kitchen tiers, the menu ---- */

      function shelfItems() {
        var out = [];
        // the four old helpers, the decorations, then the cicak (so nothing a family already has changes sides), the chicks
        HELPER_IDS.forEach(function (h) { if (h !== 'cicak' && u.helpers[h]) out.push({ kind: h, e: HELPERS[h] }); });
        u.decor.forEach(function (e) { out.push({ kind: 'decor', e: e }); });
        if (u.helpers.cicak) out.push({ kind: 'cicak', e: HELPERS.cicak });
        for (var c = 0; c < kit.chicks; c++) out.push({ kind: 'chick', e: '🐣' });
        return out;
      }

      function buildShelf() {
        shelfL.textContent = '';
        shelfR.textContent = '';
        shelfItems().forEach(function (it, i) {
          (i % 2 ? shelfR : shelfL).appendChild(el('span', { class: 'kt-item kt-item--' + it.kind, 'data-kind': it.kind, style: away[it.kind] ? { visibility: 'hidden' } : {} }, ctx.sticker(it.e)));
        });
      }
      function shelfItem(kind) { return wallEl.querySelector('.kt-item[data-kind="' + kind + '"]'); }

      /** The kitchen itself grows: a window, then string lights, then a sign with both chefs on it. */
      function renderTier() {
        wallEl.dataset.tier = String(u.tier);
        tierEl.textContent = '';
        windowEl.querySelectorAll('.kt-sign, .kt-bunting').forEach(function (n) { n.remove(); });
        windowEl.hidden = u.tier < 1;           // a window with curtains in both players' colours, behind the dish
        if (u.tier >= 2) {
          var lights = el('span', { class: 'kt-lights' });
          for (var i = 0; i < 11; i++) lights.appendChild(el('i', { style: { '--i': i } }));
          tierEl.appendChild(lights);
        }
        if (u.tier >= 3) {
          // a wooden band with a lantern at each end along the top of the wall (behind the step stickers) ...
          tierEl.appendChild(el('span', { class: 'kt-signband' },
            el('span', { class: 'kt-signband__end' }, ctx.sticker('🏮')), el('span', { class: 'kt-signband__mid' }), el('span', { class: 'kt-signband__end' }, ctx.sticker('🏮'))));
          // ... and both chefs on a little sign hung in the window, where nothing covers them
          windowEl.appendChild(el('span', { class: 'kt-sign' }, ctx.sticker(players[0].emoji, 'kt-sign__pet'), ctx.sticker(players[1].emoji, 'kt-sign__pet')));
        }
        // tier 4: red-and-white bunting across the window, its end flags in the two players' colours (under the sign)
        if (u.tier >= 4) windowEl.insertBefore(buntingEl(7, 'kt-bunting'), windowEl.firstChild);
      }
      function buntingEl(n, cls) {
        var b = el('span', { class: cls, 'aria-hidden': 'true' });
        // (each flag hangs from the sagging string: the string is the bottom of a half ellipse, -50% .. 50% of the box)
        for (var i = 0; i < n; i++) {
          var x = (i + 0.5) / n, w = 90 / n, y = -50 + 100 * Math.sqrt(1 - Math.pow(2 * x - 1, 2));
          b.appendChild(el('i', { 'data-i': String(i), style: { '--fc': i === 0 ? 'var(--p0)' : i === n - 1 ? 'var(--p1)' : i % 2 ? '#FFFFFF' : '#E8455A', left: (x * 100 - w / 2).toFixed(1) + '%', width: w.toFixed(1) + '%', top: y.toFixed(1) + '%' } }));
        }
        return b;
      }

      /** The menu's cells by group: the unlocked dishes, then the next present last in its own group. */
      function cellsByGroup() {
        var out = {};
        GROUPS.forEach(function (g) {
          out[g.id] = g.ids.filter(function (id) { return u.recipes.indexOf(id) >= 0; });
          if (u.next && GROUP_OF[u.next] === g) out[g.id].push('next');
        });
        return out;
      }
      function menuCells() { var c = cellsByGroup(), n = 0; GROUPS.forEach(function (g) { n += c[g.id].length; }); return n; }
      function hasTabs() { return menuCells() > 8; }
      function made(id) { return kit.made[id] || 0; }

      /** The menu: one page of cards (up to 8), or three wordless group tabs, each with its own page. */
      function buildMenu() {
        railEl.textContent = '';
        pageEl.textContent = '';
        var cells = cellsByGroup(), tabs = hasTabs();
        menuEl.classList.toggle('has-tabs', tabs);
        GROUPS.forEach(function (g) {
          var tone = 'var(--' + g.tone + '-soft)';
          if (tabs && cells[g.id].length) {
            var fresh = cells[g.id].some(function (id) { return id !== 'next' && !kit.cooked[id]; });
            railEl.appendChild(el('button', { type: 'button', class: 'kt-tab', 'data-group': g.id, 'aria-label': g.name, 'aria-pressed': 'false',
              style: { '--tone': 'var(--' + g.tone + ')', '--tone-soft': tone } },
              ctx.sticker(g.e), fresh ? el('span', { class: 'kt-tab__new' }, ctx.sticker('✨')) : null));
          }
          cells[g.id].forEach(function (id) {
            if (id === 'next') return;
            var R = RECIPES[id], n = kit.cooked[id] || 0, m = u.medals[id] || 0, mk = made(id), pk = pickOf(R);
            var vs = el('span', { class: 'kt-card__vs' });
            pk.choices.forEach(function (e, i) {
              var on = !!(mk & (1 << i));
              vs.appendChild(el('span', { class: 'kt-card__v' + (on ? ' is-made' : '') + (on && pk.paint ? ' has-paint' : ''), 'data-i': String(i), style: on && pk.paint ? { '--c': pk.paint[i] } : {} }, ctx.sticker(e)));
            });
            var medals = el('span', { class: 'kt-card__medals' });
            for (var k = 0; k < m; k++) medals.appendChild(ctx.sticker('🏅'));
            pageEl.appendChild(el('button', { type: 'button', class: 'kt-card' + (n ? '' : ' is-new'), 'data-id': id, 'data-group': g.id, 'data-made': String(mk), 'aria-label': NAMES[id], style: { '--tone': tone } },
              el('span', { class: 'kt-card__dish' }, dishSticker(id)), vs, medals,
              !n ? el('span', { class: 'kt-card__new' }, ctx.sticker('✨')) : mk === 7 ? el('span', { class: 'kt-card__star' }, ctx.sticker('⭐')) : null));
          });
        });
        if (u.next) {
          var dots = el('span', { class: 'kt-next__dots' });
          for (var d = 0; d < u.nextIn; d++) dots.appendChild(el('i'));
          var next = el('div', { class: 'kt-next', 'data-group': GROUP_OF[u.next].id, 'aria-label': 'Next present', style: { '--tone': 'var(--' + GROUP_OF[u.next].tone + '-soft)' } },
            el('span', { class: 'kt-next__dish' }, dishSticker(u.next)), el('span', { class: 'kt-next__tag' }, ctx.sticker('🎁')), dots);
          pageEl.appendChild(next);   // (last overall on one page; last of its group on a tab: the groups come in order)
          // the next dish is not a button: a tap only wiggles its present
          ctx.tap(next, function () { lastHinted = null; fx.wiggle(next.querySelector('.kt-next__tag')); sfx.play('flip'); });
        }
        // the open tab: the group of the dish the hand would show (set on every build; after that only taps change it)
        var tgt = menuBest(null);
        activeTab = tabs ? (tgt ? GROUP_OF[tgt].id : GROUPS[0].id) : null;
        showTab();
      }

      /** Show the open tab's cells (all of them with no tabs); hide and disable the rest. Then they pop in. */
      function showTab() {
        railEl.querySelectorAll('.kt-tab').forEach(function (t) {
          var on = t.dataset.group === activeTab;
          t.classList.toggle('is-on', on);
          t.setAttribute('aria-pressed', on ? 'true' : 'false');
        });
        var shown = [];
        pageEl.querySelectorAll('.kt-card, .kt-next').forEach(function (c) {
          var on = !activeTab || c.dataset.group === activeTab;
          c.hidden = !on;
          c.classList.remove('is-pop');
          if (c.classList.contains('kt-card')) {
            if (on && state === 'menu') c.removeAttribute('aria-disabled'); else c.setAttribute('aria-disabled', 'true');
          }
          if (on) shown.push(c);
        });
        fit();
        if (RM) return;
        void pageEl.offsetWidth;
        shown.forEach(function (c, k) {
          c.style.setProperty('--k', String(k));
          c.classList.add('is-pop');
          ctx.after(k * 40, function () { sfx.scale(k); });   // (decoration: a rising run as they pop in)
        });
      }

      /** A tap on a group tab (menu only): open it; the open one only wiggles; taps closer than 150ms only squash. */
      function onTab(ev, tab) {
        lastHinted = null;
        menuTap = ctx.time;
        if (state !== 'menu') return;
        hint(null);
        if (ctx.time - tabAt < 0.15) { squash(tab); return; }
        tabAt = ctx.time;
        var g = tab.dataset.group;
        if (g === activeTab) { fx.wiggle(tab); sfx.play('tick'); return; }
        activeTab = g;
        fx.bounce(tab);
        sfx.play('flip');
        showTab();
      }

      /* ---- the dish in the middle ---- */

      function newVessel(kind) {
        return { kind: kind, pieces: [], rim: [], level: 0, liq: null, dots: [], blobs: [], drizzles: [], mix: null, layers: 0, layerAt: [], frost: null, candles: null, added: 0,
          base: false, baseAt: null, sauce: null, baked: false, scoops: [], scoopAt: [], glaze: null, bands: [], bandAt: [] };
      }

      /** The drop-in for a thing in the dish: it plays once, from when the thing was first drawn. A redraw while it
       *  is still dropping in carries on from where it was (a negative delay); after LAND_MS nothing replays. */
      var LAND_MS = 300;
      function landing(at) {
        var t = performance.now() - at;
        return t < LAND_MS ? { cls: ' is-new', delay: -Math.round(t) + 'ms' } : { cls: '', delay: '' };
      }
      function landed(item) { if (item.at == null) item.at = performance.now(); return landing(item.at); }

      var CONE_SVG = '<svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><polygon points="6,2 94,2 50,98" fill="var(--kt-cone)" stroke="var(--line)" stroke-width="3" stroke-linejoin="round" vector-effect="non-scaling-stroke"/><line x1="24" y1="12" x2="62" y2="60" stroke="var(--kt-cone-dark)" stroke-width="3" vector-effect="non-scaling-stroke"/><line x1="76" y1="12" x2="38" y2="60" stroke="var(--kt-cone-dark)" stroke-width="3" vector-effect="non-scaling-stroke"/></svg>';
      function jellyEl(c) { return el('span', { class: 'kt-jelly', style: { '--c': c || '#F49AC1' } }); }
      function scoopEl(c) { return el('span', { class: 'kt-scoopball', style: { '--c': c || '#F49AC1' } }); }

      /** Draw the dish. Only what has just landed gets `is-new` (the drop-in animation). */
      function renderVessel() {
        var v = vessel;
        vesselEl.dataset.kind = v.kind;
        vesselEl.dataset.plate = (v.kind === 'plate' && recipe && recipe.plate) || '';   // (klepon: a banana leaf)
        if (frontEl.dataset.kind !== v.kind) { frontEl.dataset.kind = v.kind; frontEl.innerHTML = v.kind === 'cone' ? CONE_SVG : ''; }
        vesselEl.style.setProperty('--level', String(Math.min(0.6, v.level) / 0.6));
        vesselEl.style.setProperty('--liq', v.liq || 'transparent');
        vesselEl.classList.toggle('has-liq', v.level > 0);
        contentsEl.textContent = '';
        if (v.kind === 'pizza' && v.base) {
          if (v.baseAt == null) v.baseAt = performance.now();
          var bl = landing(v.baseAt);
          contentsEl.appendChild(el('span', { class: 'kt-pbase' + (v.baked ? ' is-baked' : '') + bl.cls, style: { animationDelay: bl.delay } }));
        }
        if (v.kind === 'pizza' && v.sauce) contentsEl.appendChild(el('span', { class: 'kt-psauce' + (v.baked ? ' is-baked' : ''), style: { '--c': v.sauce } }));
        if (v.mix) contentsEl.appendChild(el('span', { class: 'kt-mix', 'data-look': (recipe && recipe.look) || '', style: { '--mix': v.mix } }));
        v.scoops.forEach(function (c, i) {
          if (v.scoopAt[i] == null) v.scoopAt[i] = performance.now();
          var sk = landing(v.scoopAt[i]);
          contentsEl.appendChild(el('span', { class: 'kt-scoop' + sk.cls, 'data-i': String(i), style: { '--c': c, animationDelay: sk.delay } }));
        });
        if (v.kind === 'tin' && v.bands.length) {
          // kue lapis: one stripe per pour tap, stacking up in the order they tapped
          var tin = el('span', { class: 'kt-bands', style: { '--nb': String(Math.max(12, v.bands.length)) } });
          v.bands.forEach(function (c, i) {
            if (v.bandAt[i] == null) v.bandAt[i] = performance.now();
            var bk = landing(v.bandAt[i]);
            tin.appendChild(el('span', { class: 'kt-band' + bk.cls, style: { '--c': c, animationDelay: bk.delay } }));
          });
          contentsEl.appendChild(tin);
        }
        v.blobs.forEach(function (b, i) { contentsEl.appendChild(el('span', { class: 'kt-blob', style: { '--c': b, left: BSLOTS[i][0] + '%', top: BSLOTS[i][1] + '%' } })); });
        if (v.kind === 'cake' && v.layers) {
          var cake = el('span', { class: 'kt-cake', 'data-layers': String(v.layers) });
          for (var L = 0; L < v.layers; L++) {
            if (v.layerAt[L] == null) v.layerAt[L] = performance.now();
            var lk = landing(v.layerAt[L]);
            cake.appendChild(el('span', { class: 'kt-layer' + lk.cls, style: { animationDelay: lk.delay } }));
          }
          if (v.frost) cake.appendChild(el('span', { class: 'kt-frost', style: { '--c': v.frost } }));
          if (v.candles) {
            var row = el('span', { class: 'kt-candles' });
            v.candles.forEach(function (lit, i) { row.appendChild(el('span', { class: 'kt-candle' + (lit ? '' : ' is-out'), style: { '--c': i < 3 ? 'var(--p0)' : 'var(--p1)' } }, el('i'))); });
            cake.appendChild(row);
          }
          contentsEl.appendChild(cake);
        }
        v.drizzles.forEach(function (c, i) {
          var z = el('span', { class: 'kt-drizzle', style: { '--c': c, top: (40 + i * 12) + '%' } });
          z.innerHTML = '<svg viewBox="0 0 100 20" preserveAspectRatio="none" aria-hidden="true"><polyline points="2,10 14,3 26,17 38,3 50,17 62,3 74,17 86,3 98,10" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/></svg>';
          contentsEl.appendChild(z);
        });
        v.pieces.forEach(function (p) {
          var s = CSLOTS[p.slot], lk = landed(p);
          // what she cooked sits above the chopped bits (is-keep); what she chose sits at the normal height, under the sauces
          var tok = TOKENS.indexOf(p.e) >= 0;
          var n = el('span', { class: 'kt-piece' + (p.keep && !p.pick ? ' is-keep' : '') + (p.baked && isShape(p.e) ? ' is-cookie' : '') + lk.cls, 'data-e': p.e, style: { left: s[0] + '%', top: s[1] + '%', '--r': (p.e === 'lolly' ? 0 : p.r) + 'deg', animationDelay: lk.delay } },
            p.e === 'yolk' ? el('span', { class: 'kt-yolk' }) : p.e === 'jelly' ? jellyEl(p.c) : tok ? tokenEl(p.e, p.c) : isShape(p.e) ? cookieEl(p.e, p.baked ? 'baked' : 'raw') : ctx.sticker(p.e));
          if (v.glaze && recipe && p.e === recipe.e) n.appendChild(el('span', { class: 'kt-glaze', 'data-look': recipe.glaze || '', style: { '--c': v.glaze } }));
          contentsEl.appendChild(n);
        });
        v.dots.forEach(function (d) { contentsEl.appendChild(el('i', { class: 'kt-dot' + (v.baked ? ' is-melted' : ''), style: { left: d.x + '%', top: d.y + '%', '--c': d.c } })); });
        v.rim.forEach(function (r, i) {
          var s = RSLOTS[i], lk = landed(r);
          contentsEl.appendChild(el('span', { class: 'kt-piece kt-piece--rim' + lk.cls, 'data-e': r.e, style: { left: s[0] + '%', top: s[1] + '%', animationDelay: lk.delay } }, ctx.sticker(r.e)));
        });
        vesselEl.style.setProperty('--fill', String(fill));
        boards.forEach(function (b) { if (b.verb === 'stir' && b.obj) b.obj.style.setProperty('--batter', batterOf()); });   // (a stir bowl follows the pot)
      }

      /** The batter in a stir board's bowl: the dish's mix, in her colour on a '$c' dish. While she is still choosing
       *  that colour in this same step (puding: she picks while he stirs), it is what is in the pot, and it follows
       *  the pot to her colour as she taps. */
      function batterOf() {
        if (recipe && recipe.batter === 'dish') return vessel.level > 0 && vessel.liq ? vessel.liq : '#FFF4DC';   // (kue lapis: no mix)
        if (!recipe || !recipe.mix) return '#FFF4DC';
        var bt = beats[beatI];
        if (recipe.mix === '$c' && bt && (bt.a.do === 'pick' || bt.b.do === 'pick')) return vessel.level > 0 && vessel.liq ? vessel.liq : '#FFF4DC';
        return mixOf();
      }

      /** The piece that gives way when the eight places are full: never what she cooked (a `keep` piece) while
       *  anything else can go; first the oldest of something there is more than one of, else the oldest. */
      function evictIndex(pieces) {
        var count = {};
        pieces.forEach(function (p) { count[p.e] = (count[p.e] || 0) + 1; });
        for (var i = 0; i < pieces.length; i++) if (!pieces[i].keep && count[pieces[i].e] > 1) return i;
        for (var j = 0; j < pieces.length; j++) if (!pieces[j].keep) return j;
        return 0;
      }
      /** A sticker lands in the dish. `keep`: the thing she cooked (fried, cracked, skewered, rolled), what she chose,
       *  or the dish itself. x: {pick: true} (what she chose) or {c} (a jelly's colour). */
      function addPiece(e, keep, x) {
        var v = vessel, used = v.pieces.map(function (p) { return p.slot; }), slot = -1;
        x = x || {};
        for (var i = 0; i < CSLOTS.length; i++) if (used.indexOf(i) < 0) { slot = i; break; }
        if (slot < 0) slot = v.pieces.splice(evictIndex(v.pieces), 1)[0].slot;
        v.pieces.push({ e: e, slot: slot, r: Math.round(util.randf(-18, 18)), keep: !!keep || (!!recipe && e === recipe.e), pick: !!x.pick, c: x.c || null, baked: !!x.baked, at: null });
        v.added++;
      }
      function addRim(e) { if (vessel.rim.length >= RSLOTS.length) vessel.rim.shift(); vessel.rim.push({ e: e, at: null }); vessel.added++; }
      function addDots(c, n) {
        for (var i = 0; i < n; i++) vessel.dots.push({ c: c === 'rainbow' ? RAINBOW[(vessel.dots.length) % RAINBOW.length] : c, x: Math.round(util.randf(14, 86)), y: Math.round(util.randf(30, 78)) });
        while (vessel.dots.length > 24) vessel.dots.shift();
        vessel.added++;
      }
      function addBlob(c) { if (vessel.blobs.length >= 2) vessel.blobs.shift(); vessel.blobs.push(c); vessel.added++; }
      function addLiquid(c, d) {
        if (vessel.kind === 'tin') {
          // one stripe per tap (a full tin: the top stripe takes the new colour, so a tap always shows)
          if (vessel.bands.length < 16) vessel.bands.push(c);
          else { vessel.bands[vessel.bands.length - 1] = c; vessel.bandAt[vessel.bands.length - 1] = null; }
          vessel.added++;
          return;
        }
        if (vessel.kind === 'plate' || vessel.kind === 'wok' || vessel.kind === 'pizza') { addBlob(c); return; }   // on a plate or in a wok it is a sauce
        vessel.liq = vessel.level > 0 && vessel.liq ? mixColor(vessel.liq, c, 0.5) : c;
        vessel.level = Math.min(0.6, vessel.level + (d || 0.1));
        vessel.added++;
      }

      /** What a finished job puts in the dish at the merge. */
      function addResult(job) {
        var v = job.do, e = resultOf(job);
        if (v === 'roll') { if (job.base) { vessel.base = true; vessel.added++; } else addPiece(job.e, true); }
        else if (v === 'fry' && vessel.kind === 'cone') { if (vessel.scoops.length < 3) { vessel.scoops.push(variantColour()); vessel.added++; } }
        else if (v === 'fry' && job.e === 'jelly') addPiece('jelly', true, { c: variantColour() });
        else if (v === 'fry' && TOKENS.indexOf(job.e) >= 0) addPiece(job.e, true, { c: variantColour() });   // klepon from the pot
        else if (v === 'ball' || v === 'pop') addPiece(e, true, { c: variantColour() });
        else if (v === 'squeeze' && job.prop === 'press') { addPiece('worms', false, { c: variantColour() }); addPiece('worms', false, { c: variantColour() }); }
        else if (v === 'squeeze') { /* the bag delivered tap by tap */ }
        else if (v === 'pound' && vessel.kind === 'pizza') { vessel.sauce = SAUCE[job.e] || '#D9452B'; vessel.added++; }
        else if (v === 'chop') { addPiece(e); addPiece(e); addPiece(e); }
        else if (v === 'pound') addBlob(SAUCE[e] || '#A0642D');
        else if (v === 'crack') addPiece('yolk', true);
        else if (v === 'fry' && vessel.kind === 'cake') { vessel.layers = Math.min(2, vessel.layers + 1); vessel.added++; }
        else if (v === 'fetch' && LIQUID[e]) addLiquid(LIQUID[e], 0.15);
        else if (v === 'fetch' && SAUCE[e]) addBlob(SAUCE[e]);      // the sambal: a red sauce beside the egg
        else addPiece(e, v === 'fry' || v === 'skewer', { baked: v === 'fry' && job.prop === 'oven' });
      }

      function renderGhost() {
        ghostEl.textContent = '';
        if (!recipe) return;
        ghostEl.appendChild(el('span', { class: 'kt-ghost__grey' }, dishSticker(recipeId)));
        ghostEl.appendChild(el('span', { class: 'kt-ghost__fill' }, dishSticker(recipeId)));
      }

      /* ---- the pips: one sticker per beat, an overview only ---- */

      /** A step's sticker: her job's thing ('$' once she has chosen, else the job's own icon), her bowl, or his thing.
       *  'scoop' (es krim's fridge): a scoop in her colour, not a sticker. */
      function pipIcon(beat) {
        var j = beat.a, pk = pickOf(recipe);
        var tok = function (e) { return e === '$' ? (pickedChoice != null && pk ? pk.choices[pickedChoice] : null) : e === 'jelly' ? recipe.e : e; };
        if (j.do === 'pick') return j.choices[pickedChoice != null ? pickedChoice : 0];
        return tok(j.e) || VERBS[j.do].icon || tok(beat.b.e) || '✨';
      }
      function pipFace(e) { return e === 'scoop' ? scoopEl(variantColour()) : TOKENS.indexOf(e) >= 0 ? tokenEl(e, variantColour()) : ctx.sticker(e); }
      /** She has chosen: every step sticker that showed a stand-in now shows what she chose (a scoop: her colour). */
      function refreshPips() {
        stripEl.querySelectorAll('.kt-pip').forEach(function (p, i) {
          var st = p.querySelector(':scope > .mg-sticker'), e = beats[i] ? pipIcon(beats[i]) : null;
          if (st && e && st.textContent !== e) { st.textContent = e; fx.pop(p); }
          var sc = p.querySelector(':scope > .kt-scoopball, :scope > .kt-tok'), c = variantColour();
          if (sc && sc.style.getPropertyValue('--c') !== c) { sc.style.setProperty('--c', c); fx.pop(p); }
        });
      }
      function buildPips() {
        stripEl.textContent = '';
        beats.forEach(function (bt, i) {
          var p = el('span', { class: 'kt-pip', 'data-i': String(i) }, pipFace(pipIcon(bt)), el('span', { class: 'kt-pip__tick' }, ctx.sticker('✔️')));
          stripEl.appendChild(p);
          ctx.after(i * 60, function () { p.classList.add('is-in'); sfx.play('tick'); });
        });
      }
      function renderPips() {
        stripEl.querySelectorAll('.kt-pip').forEach(function (p, i) {
          p.classList.toggle('is-now', i === beatI && state !== 'finale');
          p.classList.toggle('is-done', i < beatI || (i === beatI && (state === 'merge' || state === 'finale')));
        });
      }

      /* ---- sizing ---- */

      function fit() {
        var s = ctx.size(), w = s.w, h = s.h, P = 12, G = 8, port = s.orient === 'portrait', U = util;
        var Wb, B, Sz, V, wallH = 0, midW = 0, row = 0, shW, shH;
        var nShelf = shelfItems().length, nb = beats.length || 6;
        if (port) {
          wallH = U.clamp(Math.round(h * 0.30), 150, 300);
          Sz = U.clamp(Math.round(h * 0.05), 22, 36);
          // (the wall has a 3px outline all round: 6px of each size)
          V = Math.min(wallH - 6 - Sz - 6, Math.round((w - 2 * P) * 0.5));
          Wb = Math.floor((w - 2 * P - G) / 2);
          B = h - 2 * P - wallH - G;
          shW = Math.floor((w - 2 * P - 6 - V - 12) / 2) - 4;
          shH = V;
        } else {
          Wb = U.clamp(Math.round(w * 0.30), 150, 320);
          // a small phone on its side: the step stickers (20px each at least) need the middle column first
          var need = nb * 20 + (nb - 1) * 4 + 22;
          Wb = Math.max(128, Math.min(Wb, Math.floor((w - 2 * P - 2 * G - need) / 2)));
          midW = w - 2 * P - 2 * Wb - 2 * G;
          B = h - 2 * P;
          Sz = U.clamp(Math.round(h * 0.08), 22, 36);
          row = nShelf ? U.clamp(Math.round(h * 0.07), 20, 44) : 0;
          V = Math.min(midW - 6 - 8, B - 6 - Sz - 2 * row - 3 * 6 - 8, 340);
          shW = midW - 6 - 8;
          shH = row;
        }
        var C = U.clamp(Math.round(Wb * 0.3), 32, 72);              // the chef
        var Wn = U.clamp(Math.round(Wb * 0.30), 36, 64);            // the want bubble
        var top = Math.max(C, Wn) + 6, inner = Wb - 16, mainH = B - 16 - top;
        var T = U.clamp(Math.min(inner, Math.round(mainH * 0.85)), 96, 240);       // the object
        var J = U.clamp(Math.floor(Math.min(inner, (mainH - 12) / 3)), 64, 120);   // a jar or bowl row
        var stripW = port ? w - 2 * P : midW;
        var pip = Math.max(20, Math.min(Sz, Math.floor((stripW - 16 - (nb - 1) * 4) / nb)));
        // still too wide (never smaller than 20px): the stickers overlap a little instead
        var pipOv = Math.min(0, Math.floor((stripW - 16 - nb * pip) / Math.max(1, nb - 1)) - 4);
        // menu: the biggest square cards that fit, in however many columns suit. With tabs, the rail of tabs takes a
        // row on top (portrait) or a column on the left (landscape), and every tab's page uses the size of the fullest
        // one, so nothing jumps when the tab changes.
        var cells = cellsByGroup(), shownG = GROUPS.filter(function (g) { return cells[g.id].length; });
        var total = 0, nMax = 0;
        shownG.forEach(function (g) { total += cells[g.id].length; nMax = Math.max(nMax, cells[g.id].length); });
        var tabs = total > 8, nt = shownG.length, MG_ = 10, TB = 0, tabW = 0, tabH = 0;
        var n = tabs ? nMax : total, W = w - 2 * P, H = h - 2 * P, card = 0, cols = 1;
        if (tabs) {
          TB = U.clamp(Math.round(Math.min(w, h) * 0.2), 64, 96);
          // (the rail has 3px on top for the open tab, which stands 3px proud)
          if (port) { tabH = TB; tabW = Math.min(Math.floor((W - (nt - 1) * MG_) / nt), Math.round(TB * 1.6)); H -= TB + 3 + MG_; }
          else { tabW = TB; tabH = Math.min(Math.floor((H - 3 - (nt - 1) * MG_) / nt), Math.round(TB * 1.6)); W -= TB + MG_; }
        }
        for (var c = 1; c <= 5; c++) {
          var r = Math.ceil(n / c);
          var z = Math.floor(Math.min((W - (c - 1) * 10) / c, (H - (r - 1) * 10) / r));
          if (z > card) { card = z; cols = c; }
        }
        card = Math.min(200, card);
        var set = function (k, v) { root.style.setProperty(k, v); };
        set('--wall', wallH + 'px'); set('--pip', pip + 'px'); set('--pip-ov', pipOv + 'px'); set('--vessel', V + 'px');
        set('--board-w', Wb + 'px'); set('--board-h', B + 'px'); set('--chef', C + 'px'); set('--want', Wn + 'px');
        set('--top', top + 'px'); set('--obj', T + 'px'); set('--jar', J + 'px'); set('--card', card + 'px'); set('--cols', String(cols));
        set('--tab-w', tabW + 'px'); set('--tab-h', tabH + 'px');
        // (the page keeps the fullest tab's size, so the tabs never move when the page changes)
        var rowsN = Math.max(1, Math.ceil(n / cols));
        set('--page-w', (cols * card + (cols - 1) * 10) + 'px'); set('--page-h', (rowsN * card + (rowsN - 1) * 10) + 'px');
        // (a page with fewer cells than the fullest keeps the card size, in fewer columns, so it stays centred)
        set('--pcols', String(Math.max(1, Math.min(cols, tabs && activeTab && cells[activeTab] ? cells[activeTab].length : total))));
        set('--gift', Math.min(Math.round(V * 0.58), 150) + 'px'); set('--shelf-row', row + 'px');
        // the shelf: the biggest items that fit half of them on each side (an item is a little wider than its emoji)
        var per = Math.ceil(nShelf / 2), deco = 14;
        for (var d = Math.min(44, Math.round(V * 0.3)); d >= 10; d--) {
          var cell = Math.ceil(d * 1.25), cc = Math.floor(shW / cell);
          if (cc >= 1 && Math.ceil(per / cc) * cell <= shH) { deco = d; break; }
        }
        set('--deco', deco + 'px');
        if (scene.hidden) return;
        // then make sure everything really fits, whatever the emoji font
        var over = function (n) { return n.scrollWidth > n.clientWidth + 1 || n.scrollHeight > n.clientHeight + 1; };
        for (var t = 0; t < 8 && deco > 10 && (over(shelfL) || over(shelfR)); t++) { deco = Math.floor(deco * 0.9); set('--deco', deco + 'px'); }
        // (only the object's own box counts: the knife, spoon and pestle hang over its edge on purpose)
        var objOver = function (b) { return b.obj && b.obj.isConnected && (b.obj.offsetWidth > b.main.clientWidth + 1 || b.obj.offsetHeight > b.main.clientHeight + 1); };
        for (var t2 = 0; t2 < 8 && T > 96 && boards.some(objOver); t2++) { T = Math.max(96, Math.floor(T * 0.9)); set('--obj', T + 'px'); }
      }

      /* ---- the ghost hand ---- */

      function hint(node, o) { lastHinted = node || null; ctx.hint(node || null, o); }
      function seen(v) { return kit.seen.indexOf(v) >= 0; }
      /** The name a job is remembered by: a fridge is new to her even after she has fried. */
      function seenKey(b) {
        var pr = b.job && b.job.prop;
        return b.verb === 'fry' && (pr === 'fridge' || pr === 'boil') ? pr : b.verb === 'squeeze' && pr === 'bag' ? 'bag' : b.verb;
      }

      /** Quiet seconds before the hand shows the next thing on side s's board. */
      function idleFor(s) {
        if (s !== aSide) return 10;
        var b = boards[s];
        if (b.verb && !seen(seenKey(b))) return 1.5;
        return [8, 5, 3][ctx.helpFor(aSide)] || 8;
      }

      /** The dish the hand would show on the menu (only group g's, when given): the newest dish never cooked (the
       *  highest gift rank; the first of the starting two on a new kitchen), else the least cooked. Ties: menu order. */
      function menuBest(g) {
        var ids = u.recipes.filter(function (id) { return !g || GROUP_OF[id].id === g; }), best = null, bestRank = -Infinity;
        ids.forEach(function (id) { if (!kit.cooked[id] && u.rank[id] > bestRank) { best = id; bestRank = u.rank[id]; } });
        if (!best) {
          var low = Infinity;
          ids.forEach(function (id) { var n = kit.cooked[id] || 0; if (n < low) { low = n; best = id; } });
        }
        return best;
      }
      /** The menu's hand: that dish when its tab is open (or there are no tabs); else the best dish on the open tab;
       *  else (a tab with only the next present) the tab that holds it. Never the next card, never a hidden card. */
      function menuTarget() {
        var id = menuBest(null);
        if (!id) return null;
        var card = function (k) { return pageEl.querySelector('.kt-card[data-id="' + k + '"]'); };
        if (!activeTab || GROUP_OF[id].id === activeTab) return card(id);
        var local = menuBest(activeTab);
        return local ? card(local) : railEl.querySelector('.kt-tab[data-group="' + GROUP_OF[id].id + '"]');
      }

      /** Where the hand points on a board: always something that moves its job on. */
      function targetOf(b) {
        if (b.verb === 'fetch') return b.parts.right || null;
        if (b.verb === 'pick') {
          // before she chooses: the first variant of this dish not yet made (the middle bowl once all three are), so
          // following the hand alone cooks every variant over three cooks
          if (b.chosen != null) return b.parts.bowls[b.chosen];
          var mk = made(recipeId), i = 0;
          while (i < 3 && (mk & (1 << i))) i++;
          return b.parts.bowls[i < 3 ? i : 1];
        }
        return b.obj;
      }

      /** The hand: her board while it is unfinished, else the other unfinished board; nothing during deals, merges and the finale. */
      function hintNext() {
        if (state === 'menu') { hint(menuTarget()); return; }
        if (state !== 'beat') { hint(null); return; }
        var s = !boards[aSide].done ? aSide : !boards[bSide].done ? bSide : -1;
        hint(s < 0 ? null : targetOf(boards[s]));
      }
      function handSide() {
        if (!lastHinted) return -1;
        for (var s = 0; s < 2; s++) if (boards[s].el.contains(lastHinted)) return s;
        return -1;
      }

      /* ---- the round: menu -> deal -> beat -> merge -> ... -> finale ---- */

      function pick(id, card) {
        if (state !== 'menu' || !RECIPES[id] || u.recipes.indexOf(id) < 0) return;
        setState('deal');
        menuEl.querySelectorAll('.kt-card').forEach(function (c) { c.setAttribute('aria-disabled', 'true'); });
        sfx.play('start');
        if (card) fx.pop(card);
        ctx.setTurn(null);
        hint(null);
        recipeId = id; recipe = RECIPES[id]; beats = beatsFor(recipe, LEN); beatI = -1;
        vesselEl.classList.remove('is-baking', 'has-lid');
        catSnacks = 0; chickThisRound = false; highDone = false; fill = 0; pickedChoice = null; smearDone = false;
        vesselEl.style.setProperty('--spin0', '0deg'); vesselEl.style.setProperty('--spin1', '0deg');
        vessel = newVessel(recipe.vessel);
        boards.forEach(function (b) {
          b.job = null; b.verb = null; b.done = false; b.obj = null; b.parts = {}; b.main.textContent = '';
          b.el.classList.remove('is-done', 'has-nose', 'has-smear', 'has-splat', 'has-tongue'); b.want.hidden = true; b.el.removeAttribute('data-verb');
          b.chef.querySelectorAll('.kt-wormdangle').forEach(function (n) { n.remove(); });
        });
        menuEl.classList.add('is-leaving');
        later(300, function () { menuEl.hidden = true; });
        scene.hidden = false;
        renderGhost();
        renderVessel();
        buildPips();
        fit();
        vesselEl.classList.remove('is-in', 'is-out');
        void vesselEl.offsetWidth;
        vesselEl.classList.add('is-in');
        boards.forEach(function (b) { fx.bounce(b.chef); });
        later(700, function () { startBeat(0); });
      }

      function jobFor(s, i) { var bt = beats[i]; return bt ? (s === aSide ? bt.a : bt.b) : null; }
      /** A beat that stirs the dish smooth: a stir, or the blender's big buttons. */
      function isStir(bt) { return ['stir', 'blend'].indexOf(bt.a.do) >= 0 || ['stir', 'blend'].indexOf(bt.b.do) >= 0; }

      function startBeat(i) {
        setState('beat');
        beatI = i;
        var beat = beats[i];
        if (beat.a.do === 'blow' && vessel.kind === 'cake') { vessel.candles = [true, true, true, true, true, true]; renderVessel(); }
        vesselEl.classList.toggle('is-stirring', isStir(beat));
        boards.forEach(function (b) {
          var s = b.side, mine = jobFor(s, i - 1), theirs = jobFor(1 - s, i - 1);
          var entry = mine && mine.to === 'stay' ? 'stay' : theirs && theirs.to === 'across' ? 'across' : 'new';
          setupBoard(b, jobFor(s, i), entry);
        });
        renderPips();
        hint(null);
        // the hand: soon on her board when the job is new to her (or it is time to taste), else when someone waits
        var a = boards[aSide];
        if (a.verb === 'taste' || a.verb === 'blow') lastTap[aSide] = ctx.time - idleFor(aSide) + 0.6;
        else if (!seen(seenKey(a))) lastTap[aSide] = ctx.time - idleFor(aSide) + 0.5;
        else lastTap[aSide] = ctx.time;
        lastTap[bSide] = ctx.time;
      }

      function setupBoard(b, job, entry) {
        job = resolveJob(job, pickOf(recipe), variant());    // ('$' -> what she chose: every later use sees the real thing)
        b.job = job; b.verb = job.do; b.n = nFor(job, ctx.helpFor(b.side), TAPOPT); b.k = 0; b.done = false;
        b.nextAt = 0; b.busyUntil = ctx.time + 0.3;           // a moment to see the new job before it can be used up
        b.phase = job.do === 'fry' ? 'heat1' : null; b.heat = 0; b.heat2 = 0;
        b.chosen = null; b.wrongRow = 0; b.sneezed = false; b.replaced = false; b.turns = 0;
        b.el.classList.remove('is-done');
        b.el.dataset.verb = job.do;
        b.el.setAttribute('role', job.do === 'fetch' || job.do === 'pick' ? 'group' : 'button');
        b.wantGen = (b.wantGen || 0) + 1;
        b.want.classList.remove('is-out');
        b.want.hidden = job.do !== 'fetch';
        b.want.textContent = '';
        b.main.textContent = '';
        b.parts = {};
        b.obj = null;
        if (job.do === 'fetch') buildFetch(b);
        else if (job.do === 'pick') buildPick(b);
        else {
          var o = el('div', { class: 'kt-obj kt-obj--' + job.do, 'data-k': '0' });
          BUILD[job.do](b, o);
          b.main.appendChild(o);
          b.obj = o;
        }
        // how it arrives: bounces in from the board's outer edge, is already there, or has just flown across
        var node = b.obj || b.parts.jarsEl || b.parts.bowlsEl;
        if (entry === 'new') {
          var hen = job.do === 'crack' && u.helpers.hen && !b.replaced ? shelfItem('hen') : null;
          if (hen) { fx.bounce(hen); S.cluck(); fly('🥚', hen, node, { ms: 380, pop: false }); node.classList.add('is-late'); ctx.after(RM ? 0 : 380, function () { node.classList.remove('is-late'); }); }
          else node.classList.add(b.side ? 'is-in-r' : 'is-in-l');
        } else if (entry === 'across') { node.classList.add('is-in-pop'); }
      }

      /** A tap a job could not use: the object squashes, a soft tick. */
      function tooSoon(b) {
        squash(b.obj || b.main);
        if (ctx.time - b.tickAt >= 0.1) { b.tickAt = ctx.time; sfx.play('tick'); }
      }

      /** A tap when there is nothing to do on this board: the chef cheers (and a taster munches some more). */
      function cheer(b) {
        if (b.done && b.verb === 'taste' && state !== 'menu') {
          if (ctx.time - b.munchAt < 0.3) { squash(b.chef); return; }
          b.munchAt = ctx.time;
          sfx.play('munch');
          faceSwap(b, util.pick(FACES), 900);
          burstAt(b.chef, { emoji: '💕', count: 3, distance: 30, size: 16 });
          gag(b, false);
          return;
        }
        if (ctx.time - b.cheerAt < 0.15) { squash(b.chef); return; }
        b.cheerAt = ctx.time;
        fx.bounce(b.chef);
        if (b.obj || b.main.firstChild) fx.wiggle(b.obj || b.main.firstChild);
        sfx.play('pop', { pitch: 600 + 60 * (b.c++ % 8) });
        burstAt(b.chef, { count: 4, distance: 36, size: 8, colors: [players[b.side].color, '#FFC933'] });
      }

      function faceSwap(b, e, ms) {
        var gen = ++b.faceGen;
        b.face.textContent = e;
        ctx.after(ms, function () { if (b.faceGen === gen) b.face.textContent = b.emoji; });
      }

      /** Counted: k moved on (or a heating tap, or a wrong jar). Feeds the idle timer and the test log. */
      function counted(b, wasHinted) {
        events.push({ t: ctx.time, side: b.side, k: b.k });
        if (events.length > 200) events.shift();
        lastTap[b.side] = wasHinted && b.el.contains(wasHinted) ? ctx.time - idleFor(b.side) + 1.5 : ctx.time;
      }

      /** The only handler for a board. */
      function onBoard(s, ev) {
        var b = boards[s], wasHinted = lastHinted;
        lastHinted = null;                                     // (the shell has taken the hand away)
        if (state !== 'beat' || b.done || !b.job) { cheer(b); return; }
        if (ctx.time < b.busyUntil || ctx.time < b.nextAt) { tooSoon(b); return; }
        var res = TAP[b.verb](b, ev);
        if (res === false) return;                             // a miss: a funny non-event, the gap is not used up
        b.nextAt = ctx.time + (b.gapNext || VERBS[b.verb].gap || GAP);
        b.gapNext = 0;
        if (b.obj) b.obj.dataset.k = String(b.k);
        counted(b, wasHinted);
        if (!b.done && b.k >= b.n && VERBS[b.verb].kind !== 'cook' && b.verb !== 'crack') finish(b);
      }

      /** This board's job is done: latched, once only. */
      function finish(b) {
        if (b.done || state !== 'beat') return;
        b.done = true;
        b.k = Math.min(b.k, b.n);
        b.el.classList.add('is-done');
        if (b.obj) b.obj.dataset.k = String(b.k);
        fx.pop(b.check);
        if (b.verb === 'fetch') hideWant(b);
        if (b.side === aSide && !seen(seenKey(b))) { kit.seen.push(seenKey(b)); save(); }
        if (boards[0].done && boards[1].done) {
          if (beatI >= beats.length - 1) finale();
          else merge();
        } else if (handSide() === b.side) hintNext();     // it finished by itself under the hand: the hand moves on
      }

      /** A finished fetch board: the want bubble pops away (it is found), so the open jar, the wave and the tick are clear. */
      function hideWant(b) {
        if (RM) { b.want.hidden = true; return; }
        var gen = b.wantGen;
        b.want.classList.add('is-out');
        ctx.after(220, function () { if (b.wantGen === gen) b.want.hidden = true; });   // (never once the next job has set it up)
      }

      function merge() {
        setState('merge');
        hint(null);
        renderPips();
        var beat = beats[beatI], i = beatI;
        later(300, function () {
          sfx.play('match');
          var radio = shelfItem('radio');
          if (radio) { fx.bounce(radio); sfx.scale(util.rand(6) + 4); }
          var t = 0;
          if (beat.serve) { serve(beat.serve); t = 400; }
          later(t, function () {
            boards.forEach(function (b) {
              var job = b.job, from = b.parts.result || b.obj || b.main;
              if (job.to === 'mid') fly(resultOf(job), from, vesselEl, { size: resultSize(), dy: 0.08 });
              else if (job.to === 'across') { fly(resultOf(job), from, boards[1 - b.side].main, { size: resultSize() }); if (from) from.classList.add('is-gone'); }
              else fx.bounce(from);
            });
            later(550, function () {
              boards.forEach(function (b) { if (b.job.to === 'mid') addResult(b.job); });
              fill = (i + 1) / beats.length;
              renderVessel();
              renderPips();
              var extra = 0;
              if (isStir(beat)) extra = stirMorph();
              if (recipe.bake && i === beats.length - 2) extra += bake(extra);   // (the last topping is on: into the oven)
              if (beat.steam) extra += steam(extra);                               // (kue lapis: the lid steams each layer)
              later(extra + 250, function () { startBeat(i + 1); });
            });
          });
        });
      }
      function resultSize() { return Math.round(parseFloat(getComputedStyle(root).getPropertyValue('--vessel')) * 0.2) || 30; }

      /** Martabak and the cake move to a plate: the old vessel slides out, the new one slides in empty. */
      function serve(kind) {
        vesselEl.classList.remove('is-in');
        vesselEl.classList.add('is-out');
        sfx.play('slide');
        later(200, function () {
          var added = vessel.added;
          vessel = newVessel(kind);
          vessel.added = added;
          renderVessel();
          vesselEl.classList.remove('is-out');
          void vesselEl.offsetWidth;
          vesselEl.classList.add('is-in');
        });
      }

      /** After stirring (or blending): everything in the dish swirls into one smooth mix; what she chose stays on top.
       *  Then a toss of the wok, the lid, or the blender's whirr. */
      function stirMorph() {
        vesselEl.classList.remove('is-stirring');
        if (!recipe.mix) { burstAt(vesselEl, { emoji: '✨', count: 8, distance: 70, size: 18 }); sfx.play('good'); return 300; }
        var kind = vessel.kind, pot = kind === 'pot', blender = kind === 'blender';
        if (!pot) contentsEl.classList.add('is-morph');
        if (blender) {
          sfx.play('whoosh');
          if (!RM) [0, 160, 320].forEach(function (d) { ctx.after(d, function () { anim(vesselEl, [{ transform: 'translateX(-2%)' }, { transform: 'translateX(2%)' }, { transform: 'translateX(0)' }], 140); }); });
        }
        later(300, function () {
          contentsEl.classList.remove('is-morph');
          var mix = mixOf();
          vessel.blobs = []; vessel.dots = [];
          if (pot) { vessel.liq = mix; vessel.level = 0.6; }                                  // soup: the vegetables stay in it
          else if (blender) { vessel.pieces = []; vessel.liq = mix; vessel.level = 0.6; }     // everything is blended
          else if (kind === 'bowl') { vessel.pieces = vessel.pieces.filter(function (p) { return p.pick; }); vessel.liq = mix; vessel.level = 0.6; }   // a smooth batter
          else { vessel.pieces = vessel.pieces.filter(function (p) { return p.pick; }); vessel.mix = mix; }   // fried rice or noodles, her topping on top
          renderVessel();
          burstAt(vesselEl, { emoji: '✨', count: 8, distance: 70, size: 18 });
          sfx.play('good');
          if (recipe.afterStir === 'toss') {
            var mixEl = contentsEl.querySelector('.kt-mix');
            [0, 280].forEach(function (d) { ctx.after(d + 100, function () { anim(mixEl, [{ transform: 'translateY(0)' }, { transform: 'translateY(-40%) rotate(-6deg)' }, { transform: 'translateY(0)' }], 260); sfx.play('whoosh'); }); });
          } else if (recipe.afterStir === 'lid') steam(0);
        });
        return 300 + (blender ? 500 : recipe.afterStir === 'toss' ? 600 : recipe.afterStir === 'lid' ? 1200 : 0);
      }

      /** The lid goes on (from `at` ms), rattles three times, dings and lifts in a puff of steam: 1.2s in all. */
      function steam(at) {
        var go = function () {
          vesselEl.classList.add('has-lid');
          [250, 450, 650].forEach(function (d) { ctx.after(d, function () { sfx.play('pop', { pitch: 420 + d * 0.3 }); anim(lidEl, [{ transform: 'translateY(0)' }, { transform: 'translateY(-10%) rotate(3deg)' }, { transform: 'translateY(0)' }], 150); }); });
          ctx.after(850, function () { sfx.play('ding'); vesselEl.classList.remove('has-lid'); burstAt(lidEl, { emoji: '♨️', count: 4, distance: 50, size: 20 }); });
        };
        if (at) later(at, go); else go();
        return 1200;
      }

      /** The pizza goes in the oven (from `at` ms): the door drops over it, glows, dings and lifts: golden, the cheese melted. */
      function bake(at) {
        later(at, function () { vesselEl.classList.add('is-baking'); sfx.play('slide'); });
        later(at + 300, function () {
          anim(ovenWin, [{ opacity: 0.45 }, { opacity: 0.9 }, { opacity: 0.45 }], 600, { replace: true });
          [0, 200, 400].forEach(function (d) { ctx.after(d, function () { S.sizzle(0.05); }); });
          burstAt(vesselEl, { emoji: '♨️', count: 4, distance: 60, size: 18 });
        });
        later(at + 700, function () { vessel.baked = true; renderVessel(); });   // (behind the door)
        later(at + 900, function () {
          sfx.play('ding');
          vesselEl.classList.remove('is-baking');
          burstAt(vesselEl, { emoji: '✨', count: 8, distance: 70, size: 18 });
        });
        return 1200;
      }

      /** The last beat is done: the dish is finished, the kitchen is saved now, a present, the party. */
      function finale() {
        kit.done++;
        kit.cooked[recipeId] = (kit.cooked[recipeId] || 0) + 1;
        var madeBefore = made(recipeId);
        if (pickedChoice != null) kit.made[recipeId] = madeBefore | (1 << pickedChoice);   // the variant she made is remembered
        save();
        var allThree = madeBefore !== 7 && made(recipeId) === 7;
        var gift = giftFor(kit.done - 1, kit.legacy, kit.legacy2), had = u;
        u = unlocks(kit.done, kit.legacy, kit.legacy2);
        setState('finale');
        hint(null);
        fill = 1;
        vesselEl.style.setProperty('--fill', '1');
        renderPips();
        var cat = shelfItem('cat');
        if (had.helpers.cat && cat) leap(cat, vesselEl, 900, function () { sfx.play('munch'); S.purr(); });
        if (had.helpers.radio) { var radio = shelfItem('radio'); fx.bounce(radio); S.tune(); }
        later(300, function () {
          contentsEl.classList.add('is-puff');
          burstAt(vesselEl, { emoji: '✨', count: 10, distance: 80, size: 20 });
          showDish();
          if (recipeId === 'cake') S.birthday(); else sfx.play('boost');
        });
        // the first time all three of a dish's variants are made: stars
        if (allThree) later(300, function () { burstAt(dishEl, { emoji: '⭐', count: 6, distance: 80, size: 22 }); sfx.play('star'); });
        later(600, function () {
          giftEl.textContent = '';
          giftEl.appendChild(el('span', { class: 'kt-gift__box' }, ctx.sticker('🎁')));
          giftEl.appendChild(el('span', { class: 'kt-gift__inside' }, giftFace(gift)));
          giftEl.hidden = false;
          sfx.play('drop');
        });
        later(1500, function () {
          giftEl.classList.add('is-open');
          sfx.play('star');
          burstAt(giftEl, { emoji: '✨', count: 10, distance: 90, size: 22 });
          // what the present brings is in the kitchen at once, behind it
          if (gift.kind === 'helper' || gift.kind === 'decor') {
            buildShelf(); fit();
            var items = wallEl.querySelectorAll(gift.kind === 'helper' ? '.kt-item--' + gift.id : '.kt-item--decor');
            if (items.length) fx.bounce(items[items.length - 1]);
          }
          else if (gift.kind === 'tier') { renderTier(); fit(); }
        });
        later(2000, function () { ctx.win('team', { emoji: recipe.e, delay: 1800 }); });
      }

      function giftFace(g) {
        if (g.kind === 'recipe') return el('span', { class: 'kt-minicard', style: { '--tone': 'var(--' + GROUP_OF[g.id].tone + '-soft)' } }, dishSticker(g.id), el('span', { class: 'kt-minicard__new' }, ctx.sticker('✨')));
        if (g.kind === 'medal') return el('span', { class: 'kt-medal' }, dishSticker(g.id), el('span', { class: 'kt-medal__m' }, ctx.sticker('🏅')));
        if (g.kind === 'tier' && g.n === 3) return el('span', { class: 'kt-signgift' }, ctx.sticker('🏮'), ctx.sticker(players[0].emoji), ctx.sticker(players[1].emoji), ctx.sticker('🏮'));
        if (g.kind === 'tier' && g.n === 4) return buntingEl(5, 'kt-buntgift');
        return ctx.sticker(g.e);
      }

      /** The finished dish: the dish sticker, with what she picked around it (or its colour behind it), and herbs. */
      function showDish() {
        dishEl.textContent = '';
        var pk = pickOf(recipe), choice = pk ? pickedChoice : null;
        if (pk && choice != null) {
          var e = pk.choices[choice];
          dishEl.dataset.choice = e;
          // a colour: the disc behind the dish, and one of what she chose beside it (colour and shape both say which)
          if (pk.paint) { dishEl.appendChild(el('span', { class: 'kt-dish__disc', style: { '--c': pk.paint[choice] } })); dishEl.appendChild(el('span', { class: 'kt-dish__top', 'data-i': '2' }, ctx.sticker(e))); }
          else for (var t = 0; t < 3; t++) dishEl.appendChild(el('span', { class: 'kt-dish__top' + (recipe.shape ? ' is-cookie' : ''), 'data-i': String(t) }, recipe.shape ? cookieEl(e, 'baked') : ctx.sticker(e)));   // (kue kering: three baked cookies of her shape)
        }
        dishEl.appendChild(el('span', { class: 'kt-dish__main' }, dishSticker(recipeId, null, variantColour())));
        if (u.helpers.herbs) dishEl.appendChild(el('span', { class: 'kt-dish__herb' }, ctx.sticker('🌿')));
        dishEl.hidden = false;
      }

      /** A shelf helper leaps to something and back (decoration). The shelf clips and the boards sit above it, so a
       *  copy of the helper flies over everything while the one on the shelf is hidden. onArrive runs when it lands. */
      var LEAP_AT = 0.42;
      function leap(node, toNode, ms, onArrive) {
        if (!node || !toNode || !node.isConnected || !toNode.isConnected || away[node.dataset.kind]) { if (onArrive) onArrive(); return; }
        var st = node.querySelector('.mg-sticker') || node, r = root.getBoundingClientRect();
        var a = fx.centerOf(st), b = fx.centerOf(toNode), dx = b.x - a.x, dy = b.y - a.y;
        var size = Math.max(16, parseFloat(getComputedStyle(st).fontSize) || 16);
        var f = el('span', { class: 'kt-flyer kt-flyer--leap', style: { fontSize: size + 'px' } }, ctx.sticker(st.textContent));
        var kind = node.dataset.kind;
        away[kind] = (away[kind] || 0) + 1;
        node.style.visibility = 'hidden';
        var home = function () {
          f.remove();
          away[kind] = Math.max(0, (away[kind] || 1) - 1);
          // the shelf may have been rebuilt while it was out (a present, a chick): show the one there now
          var mine = shelfItem(kind);
          if (!away[kind] && mine) mine.style.visibility = '';
        };
        if (RM) {
          // no arc: it is simply there for a moment, fading in and out
          f.style.left = (b.x - r.left) + 'px'; f.style.top = (b.y - r.top) + 'px';
          root.appendChild(f);
          if (f.animate) f.animate([{ opacity: 0, transform: 'translate(-50%, -50%) scale(1.6)' }, { opacity: 1, transform: 'translate(-50%, -50%) scale(1.6)', offset: 0.2 }, { opacity: 1, transform: 'translate(-50%, -50%) scale(1.6)', offset: 0.8 }, { opacity: 0, transform: 'translate(-50%, -50%) scale(1.6)' }], { duration: 600, fill: 'forwards' });
          if (onArrive) onArrive();
          ctx.after(620, home);
          return;
        }
        f.style.left = (a.x - r.left) + 'px'; f.style.top = (a.y - r.top) + 'px';
        root.appendChild(f);
        var hop = Math.min(90, 40 + Math.abs(dx) * 0.2);
        var at = function (x, y, sc, rot) { return 'translate(calc(-50% + ' + x + 'px), calc(-50% + ' + y + 'px)) scale(' + sc + ')' + (rot ? ' rotate(' + rot + 'deg)' : ''); };
        if (f.animate) f.animate([
          { transform: at(0, 0, 1) },
          { transform: at(dx * 0.5, dy * 0.5 - hop, 1.5), offset: LEAP_AT * 0.55 },
          { transform: at(dx, dy, 1.8), offset: LEAP_AT },
          { transform: at(dx, dy, 1.8, -10), offset: LEAP_AT + 0.1 },
          { transform: at(dx, dy, 1.8, 6), offset: LEAP_AT + 0.2 },
          { transform: at(dx * 0.5, dy * 0.5 - hop, 1.4), offset: LEAP_AT + 0.4 },
          { transform: at(0, 0, 1) },
        ], { duration: ms, easing: 'ease-in-out', fill: 'forwards' });
        if (onArrive) ctx.after(ms * LEAP_AT, onArrive);
        ctx.after(ms + 20, home);
      }

      /* ---- cooking: one shared clock ---- */

      function heatStep(b) {
        if (b.done || b.verb !== 'fry') return;
        var cs = COOK_S[ctx.helpFor(b.side)] || 3;
        if (b.phase === 'heat1') {
          b.heat = Math.min(1, b.heat + 0.1 / cs);
          b.obj.style.setProperty('--cook', b.heat.toFixed(2));
          if (b.heat >= 1) gold(b);
        } else if (b.phase === 'heat2') {
          b.heat2 = Math.min(1, b.heat2 + 0.1 / (cs * 0.6));
          b.obj.style.setProperty('--side2', b.heat2.toFixed(2));
          if (b.heat2 >= 1) { b.phase = 'done'; b.obj.classList.add('is-cooked'); sfx.play('good'); finish(b); }
        }
      }
      function cookTick() {
        if (state !== 'beat') return;
        boards.forEach(function (b) {
          if (b.done || b.verb !== 'fry') return;
          if (b.phase === 'heat1' || b.phase === 'heat2') {
            heatStep(b);
            if (b.job.prop === 'boil') { if (ctx.time - b.sizzleAt >= 0.5) { b.sizzleAt = ctx.time; S.blub(); } }   // (a pot blubs)
            else if (b.job.prop !== 'fridge' && ctx.time - b.sizzleAt >= 0.3) { b.sizzleAt = ctx.time; S.sizzle(0.03); }   // (a fridge is quiet)
          }
        });
      }

      /** Golden: a ding, a sparkle, steam; this board alone waits a moment so a hammering finger cannot flip it unseen. */
      function gold(b) {
        b.phase = 'gold';
        b.obj.classList.add('is-gold');
        sfx.play('ding');
        if (b.job.prop === 'boil') burstAt(b.parts.food, { emoji: '💧', count: 3, distance: 36, size: 12 });   // (they float up)
        b.busyUntil = ctx.time + LATCH;
      }

      /* ---- the jobs: how each one looks ---- */

      var BUILD = {
        wash: function (b, o) {
          var job = b.job, item = el('span', { class: 'kt-jitem' }, ctx.sticker(job.e)), muds = [];
          for (var i = 0; i < b.n; i++) { var m = el('i', { class: 'kt-mud', style: { left: MUD[i][0] + '%', top: MUD[i][1] + '%' } }); item.appendChild(m); muds.push(m); }
          o.appendChild(el('span', { class: 'kt-sink' }));
          o.appendChild(el('span', { class: 'kt-stream' }));
          o.appendChild(el('span', { class: 'kt-faucet' }, ctx.sticker('🚰')));
          o.appendChild(item);
          o.appendChild(el('span', { class: 'kt-shine' }));
          b.parts = { item: item, muds: muds, result: item };
        },
        peel: function (b, o) {
          var job = b.job, item = el('span', { class: 'kt-jitem' }, ctx.sticker(job.e)), petals = [];
          for (var i = 0; i < b.n; i++) { var p = el('i', { class: 'kt-petal', style: { '--a': Math.round(i * 360 / b.n - 30) + 'deg', '--c': PEEL[job.e] || '#F7D35C' } }); petals.push(p); item.appendChild(p); }
          o.appendChild(item);
          b.parts = { item: item, petals: petals, result: item };
        },
        chop: function (b, o) {
          var pile = el('span', { class: 'kt-slices' }), knife = el('span', { class: 'kt-knife' }, ctx.sticker('🔪'));
          o.appendChild(el('span', { class: 'kt-cboard' }));
          o.appendChild(pile);
          o.appendChild(knife);
          b.parts = { pile: pile, knife: knife, result: pile };
          slices(b, 1);
        },
        pound: function (b, o) {
          var e = b.job.e, mash = el('span', { class: 'kt-mash' }, ctx.sticker(e), ctx.sticker(e), ctx.sticker(e));
          var sauce = el('span', { class: 'kt-sauce', style: { '--c': SAUCE[e] || '#A0642D' } });
          var cobek = el('span', { class: 'kt-cobek' }, sauce, mash);
          var pestle = el('span', { class: 'kt-pestle' });
          o.appendChild(cobek);
          o.appendChild(pestle);
          o.style.setProperty('--p', '0');
          b.parts = { cobek: cobek, pestle: pestle, result: cobek };
        },
        crack: function (b, o) {
          var line = el('span', { class: 'kt-crackline' });
          line.innerHTML = '<svg viewBox="0 0 100 24" preserveAspectRatio="none" aria-hidden="true"><polyline points="0,12 12,4 24,20 36,4 48,20 60,4 72,20 84,4 100,12" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round" vector-effect="non-scaling-stroke"/></svg>';
          var egg = el('span', { class: 'kt-egg' }, el('span', { class: 'kt-shell kt-shell--top' }), el('span', { class: 'kt-shell kt-shell--bot' }), line);
          var yolks = el('span', { class: 'kt-yolks' });
          var bowl = el('span', { class: 'kt-sbowl' }, yolks);
          o.appendChild(bowl);
          o.appendChild(egg);
          o.style.setProperty('--crack', '0');
          b.parts = { egg: egg, bowl: bowl, yolks: yolks, result: bowl };
        },
        skewer: function (b, o) {
          var cubes = [];
          var stick = el('span', { class: 'kt-stick' });
          o.appendChild(stick);
          for (var i = 0; i < 3; i++) { var c = el('span', { class: 'kt-cube', 'data-i': String(i) }); cubes.push(c); o.appendChild(c); }
          var sate = el('span', { class: 'kt-sate' }, ctx.sticker('🍢'));
          o.appendChild(sate);
          b.parts = { cubes: cubes, sate: sate, result: o };
        },
        stir: function (b, o) {
          var spoon = el('span', { class: 'kt-spoon' }, ctx.sticker('🥄'));
          o.appendChild(el('span', { class: 'kt-mswirl' }, el('i'), el('i')));
          o.appendChild(spoon);
          o.style.setProperty('--turn', '0deg');
          o.style.setProperty('--batter', batterOf());        // (her colour on a '$c' dish: never the raw token)
          b.parts = { spoon: spoon };
          if (recipe.batter === 'toss') {
            // salad buah: no batter, the fruit itself tosses round the bowl (a little dressing on it)
            var pk = pickOf(recipe), fr = [pk ? pk.choices[variant()] : '🍓', '🍎', '🍈', pk ? pk.choices[variant()] : '🍓', '🍎'];
            var toss = el('span', { class: 'kt-toss' });
            fr.forEach(function (e, i) { toss.appendChild(el('i', { 'data-i': String(i) }, ctx.sticker(e))); });
            var drs = el('span', { class: 'kt-toss__dressing' });   // (the creamy dressing zigzag on the fruit: the dish's drizzle look)
            drs.innerHTML = '<svg viewBox="0 0 100 20" preserveAspectRatio="none" aria-hidden="true"><polyline points="2,10 14,3 26,17 38,3 50,17 62,3 74,17 86,3 98,10" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/></svg>';
            toss.appendChild(drs);
            o.classList.add('is-toss');
            o.insertBefore(toss, spoon);
            b.parts.toss = toss;
          }
        },
        pour: function (b, o) {
          var job = b.job, jug = el('span', { class: 'kt-jug', style: { '--liq': job.liquid } }, el('span', { class: 'kt-jug__body' }), el('span', { class: 'kt-jug__band' }), el('span', { class: 'kt-jug__label' }, ctx.sticker(job.e)));
          o.appendChild(jug);
          b.parts = { jug: jug };
        },
        shake: function (b, o) {
          var sh = el('span', { class: 'kt-shaker' }, ctx.sticker(b.job.e));
          o.appendChild(el('span', { class: 'kt-plate-s' }));
          o.appendChild(el('span', { class: 'kt-fall' + (b.job.dots === 'rainbow' ? ' is-rainbow' : ''), style: { '--c': b.job.dots === 'rainbow' ? RAINBOW[0] : b.job.dots } }));
          o.appendChild(sh);
          b.parts = { shaker: sh };
        },
        garnish: function (b, o) {
          var bits = [], saucer = el('span', { class: 'kt-saucer' });
          for (var i = 0; i < 3; i++) { var g = el('span', { class: 'kt-bit', 'data-i': String(i) }, ctx.sticker(b.job.e)); bits.push(g); saucer.appendChild(g); }
          o.appendChild(saucer);
          b.parts = { bits: bits };
        },
        scoop: function (b, o) {
          var dome = el('span', { class: 'kt-dome', 'data-e': b.job.e || '🍚' });   // (noodles look like noodles)
          o.appendChild(el('span', { class: 'kt-ricepot' }, dome, el('span', { class: 'kt-ricepot__body' })));
          var spoon = el('span', { class: 'kt-scoop' }, ctx.sticker('🥄'));
          o.appendChild(spoon);
          b.parts = { dome: dome, spoon: spoon };
        },
        fry: function (b, o) {
          var job = b.job, tok = TOKENS.indexOf(job.e) >= 0, cookie = isShape(job.e);
          var food = el('span', { class: 'kt-food' + (cookie ? ' is-cookie' : '') },
            job.e === 'jelly' ? jellyEl(variantColour()) : job.e === 'scoop' ? scoopEl(variantColour()) : tok ? tokenEl(job.e, variantColour()) : cookie ? cookieEl(job.e, 'oven') : ctx.sticker(job.e));
          o.classList.add('kt-prop--' + job.prop);
          o.style.setProperty('--cook', '0');
          o.style.setProperty('--side2', '0');
          if (job.prop === 'boil') {
            // a pot of boiling water: they sink, it bubbles, and when they are cooked they float up
            o.appendChild(el('span', { class: 'kt-bpot' }));
            o.appendChild(el('span', { class: 'kt-bwater' }, el('i', { class: 'kt-bubble' }), el('i', { class: 'kt-bubble' }), el('i', { class: 'kt-bubble' })));
            o.appendChild(food);
            o.appendChild(el('span', { class: 'kt-goldspark' }, ctx.sticker('✨')));
            o.appendChild(el('span', { class: 'kt-steam' }, ctx.sticker('♨️')));
            b.parts = { food: food, result: food };
            return;
          }
          if (job.prop === 'fridge') {
            // a fridge: it chills instead of heating (frost creeps over the window), then the door opens and out it comes
            o.appendChild(el('span', { class: 'kt-fridge' },
              el('span', { class: 'kt-fridge__win' }, food, el('span', { class: 'kt-fridge__frost' })),
              el('span', { class: 'kt-fridge__door' })));
            o.appendChild(el('span', { class: 'kt-goldspark' }, ctx.sticker('❄️')));
            b.parts = { food: food, result: food, win: o.querySelector('.kt-fridge__win') };
            return;
          }
          if (job.prop === 'pan') {
            o.appendChild(el('span', { class: 'kt-fire' }, ctx.sticker('🔥')));
            o.appendChild(el('span', { class: 'kt-pan' }, el('span', { class: 'kt-pan__handle' })));
            o.appendChild(food);
          } else if (job.prop === 'grill') {
            o.appendChild(el('span', { class: 'kt-coals' }, el('i'), el('i'), el('i'), el('i'), el('i')));
            o.appendChild(el('span', { class: 'kt-bars' }));
            o.appendChild(food);
          } else {
            o.appendChild(el('span', { class: 'kt-oven' }, el('span', { class: 'kt-oven__knobs' }, el('i'), el('i')), el('span', { class: 'kt-oven__win' }, food), el('span', { class: 'kt-oven__door' })));
          }
          o.appendChild(el('span', { class: 'kt-goldspark' }, ctx.sticker('✨')));
          o.appendChild(el('span', { class: 'kt-steam' }, ctx.sticker('♨️')));
          b.parts = { food: food, result: food };
        },
        roll: function (b, o) {
          // a rolling pin flattens the dough; then a cutter pops out the shape (or the dough itself is the pizza base)
          var pin = el('span', { class: 'kt-pin' }), dough = el('span', { class: 'kt-dough' }), cutter = el('span', { class: 'kt-cutter' });
          var cut = b.job.base ? null : el('span', { class: 'kt-cut' }, isShape(b.job.e) ? el('span', { class: 'kt-cut__raw is-cookie' }, cookieEl(b.job.e, 'raw')) : el('span', { class: 'kt-cut__raw' }, ctx.sticker(b.job.e)));
          o.appendChild(el('span', { class: 'kt-cboard' }));
          o.appendChild(dough);
          if (cut) o.appendChild(cut);
          o.appendChild(cutter);
          o.appendChild(pin);
          o.style.setProperty('--f', '0');
          b.parts = { pin: pin, dough: dough, cutter: cutter, cut: cut, result: dough };
        },
        blend: function (b, o) {
          // the big button on your own board whirrs the blender in the middle
          var swirl = ctx.sticker('🌀'), btn = el('span', { class: 'kt-bigbtn' }, swirl);
          o.appendChild(el('span', { class: 'kt-bjug' }, el('span', { class: 'kt-bjug__fill' })));
          o.appendChild(el('span', { class: 'kt-bbase' }));
          o.appendChild(btn);
          o.style.setProperty('--liq-now', vessel.liq || '#FFF4E0');
          o.style.setProperty('--fillk', '0.3');
          b.parts = { btn: btn, swirl: swirl };
        },
        spread: function (b, o) {
          // a butter knife paints her spread onto a slice of bread, one stripe a tap
          var job = b.job, bread = el('span', { class: 'kt-bread' }), bands = [];
          for (var i = 0; i < b.n; i++) { var bd = el('i', { class: 'kt-band', style: { top: (12 + i * 76 / b.n) + '%', height: (76 / b.n + 1) + '%' } }); bands.push(bd); bread.appendChild(bd); }
          bread.appendChild(el('i', { class: 'kt-spreadall' }));
          var knife = el('span', { class: 'kt-spreader' });
          o.appendChild(el('span', { class: 'kt-cboard' }));
          o.appendChild(bread);
          o.appendChild(knife);
          o.style.setProperty('--c', job.c);
          o.style.setProperty('--sy', String(knifeY(0, b.n)));
          b.parts = { bread: bread, bands: bands, knife: knife, result: bread };
        },
        ball: function (b, o) {
          // two hands roll a lump of dough (her colour) into a ball; klepon hides a secret sugar inside
          var job = b.job, lump = el('span', { class: 'kt-lump' + (job.e === 'kepal' ? ' is-snow' : '') });
          var sugar = job.fill ? el('span', { class: 'kt-sugar', style: { '--f': job.fill } }) : null;
          var hands = el('span', { class: 'kt-hands' }, ctx.sticker('🤲'));
          o.appendChild(el('span', { class: 'kt-cboard' }));
          o.appendChild(lump);
          if (sugar) o.appendChild(sugar);
          o.appendChild(hands);
          o.style.setProperty('--c', variantColour());
          o.style.setProperty('--r', '0');
          o.style.setProperty('--spin', '0deg');
          b.parts = { lump: lump, sugar: sugar, hands: hands, result: lump };
        },
        squeeze: function (b, o) {
          var job = b.job;
          if (job.prop === 'press') {
            // a cendol press over a bowl of ice water: the plunger pushes the dough out as wriggly worms
            var worms = el('span', { class: 'kt-worms' }), plunger = el('span', { class: 'kt-plunger' });
            var press = el('span', { class: 'kt-press' }, el('i'));
            o.appendChild(el('span', { class: 'kt-wbowl' }));
            o.appendChild(worms);
            o.appendChild(press);
            o.appendChild(plunger);
            o.style.setProperty('--c', variantColour());
            o.style.setProperty('--sq', '0');
            b.parts = { press: press, worms: worms, plunger: plunger, result: worms };
            return;
          }
          // a piping bag: icing dots (or the creamy dressing) go into the dish a squeeze at a time
          var bag = el('span', { class: 'kt-bag', style: { '--liq': job.liquid } }, el('i', { class: 'kt-bag__band' }), el('i', { class: 'kt-bag__tip' }));
          var dots = el('span', { class: 'kt-pdots' });
          o.appendChild(el('span', { class: 'kt-plate-s' }));
          o.appendChild(dots);
          o.appendChild(bag);
          b.parts = { bag: bag, dots: dots };
        },
        pop: function (b, o) {
          // an ice lolly in its mould: wiggle the stick, wiggle again, POP
          var mould = el('span', { class: 'kt-mould' });
          var set = el('span', { class: 'kt-lollyset' }, el('span', { class: 'kt-lstick' }), el('span', { class: 'kt-lolly' }));
          var crack = el('span', { class: 'kt-mcrack' });
          crack.innerHTML = '<svg viewBox="0 0 100 24" preserveAspectRatio="none" aria-hidden="true"><polyline points="0,12 12,4 24,20 36,4 48,20 60,4 72,20 84,4 100,12" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round" vector-effect="non-scaling-stroke"/></svg>';
          o.appendChild(mould);
          o.appendChild(set);
          o.appendChild(crack);
          o.style.setProperty('--c', variantColour());
          o.style.setProperty('--crk', '0');
          b.parts = { mould: mould, set: set, result: set };
        },
        taste: function (b, o) {
          o.appendChild(el('span', { class: 'kt-tbowl' }, el('span', { class: 'kt-tbowl__food' }, dishSticker(recipeId, null, variantColour()))));
          var spoon = el('span', { class: 'kt-tspoon' }, ctx.sticker('🥄'));
          o.appendChild(spoon);
          b.parts = { spoon: spoon };
        },
        blow: function (b, o) {
          var flames = [], candles = el('span', { class: 'kt-mcandles' });
          for (var i = 0; i < 3; i++) { var c = el('span', { class: 'kt-candle', style: { '--c': 'var(--p' + b.side + ')' } }, el('i')); flames.push(c); candles.appendChild(c); }
          o.appendChild(el('span', { class: 'kt-minicake' }, candles, el('span', { class: 'kt-minicake__top' }), el('span', { class: 'kt-minicake__body' })));
          b.parts = { candles: flames };
        },
      };

      function slices(b, c) {
        var pile = b.parts.pile, have = pile.childNodes.length;
        for (; have < Math.min(6, c); have++) pile.appendChild(el('span', { class: 'kt-slice' }, ctx.sticker(b.job.e)));
        pile.classList.toggle('is-cut', c > 1);
        pile.childNodes.forEach(function (n, i) {
          var p = c > 1 ? SPREAD[i] : [0, 0];
          n.style.setProperty('--x', p[0] + 'em');
          n.style.setProperty('--y', p[1] + 'em');
        });
      }

      function buildFetch(b) {
        var job = b.job, help = ctx.helpFor(b.side);
        b.want.appendChild(ctx.sticker(job.e));
        var list = util.shuffle(job.jars.slice());
        if (help >= 2) list = util.shuffle([job.e, util.pick(job.jars.filter(function (e) { return e !== job.e; }))]);
        var jarsEl = el('div', { class: 'kt-jars', 'data-n': String(list.length) });
        var jars = list.map(function (e) {
          var jar = el('button', { type: 'button', class: 'kt-jar' + (e === job.e && help === 1 ? ' is-bob' : ''), 'data-e': e, 'aria-label': 'Jar' },
            el('span', { class: 'kt-glass' }, el('span', { class: 'kt-glass__lid' }), el('span', { class: 'kt-glass__in' }, ctx.sticker(e))));
          jarsEl.appendChild(jar);
          if (e === job.e) b.parts.right = jar;
          return jar;
        });
        b.main.appendChild(jarsEl);
        b.parts.jars = jars;
        b.parts.jarsEl = jarsEl;
      }

      function buildPick(b) {
        var job = b.job, mk = made(recipeId);
        var bowlsEl = el('div', { class: 'kt-bowls' });
        var bowls = job.choices.map(function (e, i) {
          var inner = el('span', { class: 'kt-pbowl' });
          if (job.paint) { inner.appendChild(el('span', { class: 'kt-pool', style: { '--c': job.paint[i] } })); inner.appendChild(el('span', { class: 'kt-pbowl__fruit' }, ctx.sticker(e))); }
          else for (var t = 0; t < 3; t++) inner.appendChild(el('span', { class: 'kt-pbowl__bit', 'data-t': String(t) }, ctx.sticker(e)));
          // once a variant of this dish has been made, the ones never made wear a sparkle (made ones look normal)
          var fresh = mk && !(mk & (1 << i));
          var bowl = el('button', { type: 'button', class: 'kt-bowl' + (fresh ? ' is-fresh' : ''), 'data-i': String(i), 'data-pos': String(i), 'aria-label': 'Bowl' }, inner,
            fresh ? el('span', { class: 'kt-bowl__new' }, ctx.sticker('✨')) : null);
          bowlsEl.appendChild(bowl);
          return bowl;
        });
        b.main.appendChild(bowlsEl);
        b.parts.bowls = bowls;
        b.parts.bowlsEl = bowlsEl;
      }

      /** The nearest enabled element matching sel inside the board within `slop` px of the tap (Garden-style no dead gaps). */
      function nearestIn(b, sel, ev, slop) {
        var t = ev.target && ev.target.closest ? ev.target.closest(sel) : null;
        if (t && b.el.contains(t) && t.getAttribute('aria-disabled') !== 'true') return t;
        if (ev.clientX == null) return null;
        var best = null, bestD = slop;
        b.el.querySelectorAll(sel).forEach(function (n) {
          if (n.getAttribute('aria-disabled') === 'true') return;
          var r = n.getBoundingClientRect();
          if (!r.width) return;
          var dx = Math.max(r.left - ev.clientX, 0, ev.clientX - r.right), dy = Math.max(r.top - ev.clientY, 0, ev.clientY - r.bottom);
          var d = Math.sqrt(dx * dx + dy * dy);
          if (d <= bestD) { best = n; bestD = d; }
        });
        return best;
      }

      /** Surprise rolls; a test can force the next one. */
      function roll(name, p) { if (forced[name]) { delete forced[name]; return true; } return Math.random() < p; }

      /* ---- the jobs: what a tap does. Return false for a miss (nothing used up). ---- */

      var TAP = {
        wash: function (b) {
          var m = b.parts.muds[b.k];
          if (m) m.classList.add('is-off');
          burstAt(b.parts.item, { emoji: '💦', count: 4, distance: 40, size: 16 });
          sfx.play('splash'); S.squeak(b.k);
          anim(b.obj.querySelector('.kt-stream'), [{ opacity: 1 }, { opacity: 0.2 }], 260, { replace: true });
          b.k++;
          if (b.k >= b.n) {
            b.obj.classList.add('is-clean');
            burstAt(b.parts.item, { emoji: '✨', count: 6, distance: 50, size: 16 });
            sfx.seq([79, 84, 88], { step: 0.08, type: 'sine', gain: 0.16 });
          }
        },
        peel: function (b) {
          var p = b.parts.petals[b.k];
          if (p) p.classList.add('is-off');
          S.shhk(); sfx.play('pop', { pitch: 500 + 80 * b.k });
          b.k++;
          if (b.k >= b.n) { b.obj.classList.add('is-clean'); fx.pop(b.parts.item); sfx.play('good'); }
        },
        chop: function (b) {
          anim(b.parts.knife, [{ transform: 'rotate(0deg)' }, { transform: 'rotate(-38deg) translateY(10%)' }, { transform: 'rotate(0deg)' }], 200);
          S.tok(b.k);
          b.k++;
          slices(b, b.k + 1);
          if (b.k >= b.n) {
            b.parts.pile.classList.add('is-pile');
            b.parts.pile.childNodes.forEach(function (n, i) { var p = PILE[i]; n.style.setProperty('--x', p[0] + 'em'); n.style.setProperty('--y', p[1] + 'em'); });
            fx.bounce(b.parts.pile);
            sfx.play('good');
          }
        },
        pound: function (b) {
          anim(b.parts.pestle, [{ transform: 'translateY(0)' }, { transform: 'translateY(38%)' }, { transform: 'translateY(0)' }], 180);
          S.dug();
          fx.shake(b.parts.cobek);
          b.k++;
          b.obj.style.setProperty('--p', (b.k / b.n).toFixed(2));
          if (b.k >= b.n) sfx.play('good');
        },
        crack: function (b) {
          b.k++;
          if (b.k < b.n) { crackLine(b); return; }
          if (b.n === 1) {
            // one tap does both: the crack now, the egg opens a moment later
            crackLine(b);
            b.busyUntil = ctx.time + 0.25;
            later(250, function () { openEgg(b); });
            return;
          }
          openEgg(b);
        },
        skewer: function (b) {
          var c = b.parts.cubes[b.k];
          if (c) c.classList.add('is-on');
          b.k++;
          sfx.play('hop', { pitch: 500 + 120 * (b.k - 1) });
          ctx.say(b.k);
          if (b.k >= b.n) { b.obj.classList.add('is-sate'); fx.pop(b.parts.sate); sfx.play('good'); }
        },
        stir: function (b) {
          b.turns++;
          b.obj.style.setProperty('--turn', (b.turns * 90) + 'deg');
          vesselEl.style.setProperty('--spin' + b.side, (b.turns * 90) + 'deg');
          var snd = recipe.stir || 'swish';
          if (snd === 'sizzle') S.sizzle(0.06); else if (snd === 'clink') S.clink(); else S.swish();
          if (b.parts.toss) [].forEach.call(b.parts.toss.children, function (f, i) {   // (salad buah: the fruit jumps)
            anim(f, [{ transform: 'translateY(0)' }, { transform: 'translateY(-' + (40 + 15 * (i % 3)) + '%) rotate(' + (i % 2 ? -25 : 25) + 'deg)' }, { transform: 'translateY(0)' }], 260 + 30 * (i % 3));
          });
          sfx.scale(b.k + 2);
          b.k++;
          if (b.k >= b.n) sfx.play('good');
        },
        pour: function (b) {
          var job = b.job, dir = b.side ? -1 : 1;
          anim(b.parts.jug, [{ transform: 'rotate(0deg)' }, { transform: 'rotate(' + 28 * dir + 'deg)' }, { transform: 'rotate(0deg)' }], 360);
          S.glug();
          b.k++;
          countAloud(b.k);
          if (job.drizzle) { if (vessel.drizzles.length >= 4) vessel.drizzles.shift(); vessel.drizzles.push(job.liquid); vessel.added++; }
          else addLiquid(job.liquid, 0.1);
          fly(el('span', { class: 'kt-drop', style: { '--c': job.liquid } }), b.parts.jug, vesselEl, { ms: 350, size: resultSize() * 0.6 });
          ctx.after(RM ? 0 : 350, renderVessel);
          if (b.k >= b.n) sfx.play('ding');
        },
        shake: function (b) {
          var job = b.job;
          anim(b.parts.shaker, [{ transform: 'rotate(0deg)' }, { transform: 'rotate(170deg) translateX(-6%)' }, { transform: 'rotate(190deg) translateX(6%)' }, { transform: 'rotate(170deg) translateX(-6%)' }, { transform: 'rotate(0deg)' }], 420);
          anim(b.obj.querySelector('.kt-fall'), [{ opacity: 1 }, { opacity: 0 }], 420, { replace: true });
          sfx.play('roll');
          for (var t = 0; t < 3; t++) sfx.tone({ freq: 900, dur: 0.03, type: 'square', gain: 0.05, delay: 0.08 + t * 0.07 });
          b.k++;
          countAloud(b.k);
          addDots(job.dots, 6);
          ctx.after(RM ? 0 : 250, renderVessel);
          if (job.e === '🧂' && !b.sneezed && roll('sneeze', 0.25)) {
            // a sneeze: that chef wobbles and keeps a white dot on the nose for the rest of the round
            b.sneezed = true;
            ctx.after(200, function () { S.sneeze(); fx.shake(b.chef); b.el.classList.add('has-nose'); });
          }
          if (b.k >= b.n) sfx.play('good');
        },
        garnish: function (b) {
          var e = b.job.e, bit = b.parts.bits[b.k];
          fly(e, bit, vesselEl, { ms: 420, size: resultSize() * 0.8, dy: -0.1 });
          if (bit) bit.classList.add('is-off');
          if (e === '❄️') S.clink(); else sfx.play('pop', { pitch: 500 + 90 * b.k });
          b.k++;
          countAloud(b.k);
          addRim(e);
          ctx.after(RM ? 0 : 420, renderVessel);
          if (b.k >= b.n) sfx.play('star');
        },
        scoop: function (b) {
          anim(b.parts.spoon, [{ transform: 'rotate(0deg)' }, { transform: 'rotate(-30deg) translateY(-12%)' }, { transform: 'rotate(0deg)' }], 260);
          fly(b.job.e || '🍚', b.parts.dome, vesselEl, { ms: 420, size: resultSize() });
          sfx.play('pop', { pitch: b.k ? 650 : 500 });
          b.k++;
          countAloud(b.k);
          b.obj.style.setProperty('--left', String(1 - b.k / b.n));
          addPiece(b.job.e || '🍚');
          ctx.after(RM ? 0 : 420, renderVessel);
          if (b.k >= b.n) sfx.play('good');
        },
        fry: function (b) {
          if (b.phase === 'heat1' || b.phase === 'heat2') {
            // never a dead tap: the pan wiggles and sizzles, the coals get fanned, the oven glows (and it cooks a little faster)
            if (b.phase === 'heat1') { b.heat = Math.min(0.99, b.heat + 0.15); b.obj.style.setProperty('--cook', b.heat.toFixed(2)); }
            else { b.heat2 = Math.min(0.99, b.heat2 + 0.15); b.obj.style.setProperty('--side2', b.heat2.toFixed(2)); }
            fx.wiggle(b.parts.food);
            if (b.job.prop === 'fridge') { S.clink(); burstAt(b.parts.win, { emoji: '❄️', count: 3, distance: 30, size: 14 }); return; }
            if (b.job.prop === 'boil') { S.blub(); burstAt(b.parts.food, { emoji: '💧', count: 2, distance: 30, size: 12 }); return; }
            S.sizzle(0.06);
            if (b.job.prop === 'grill') burstAt(b.obj.querySelector('.kt-coals'), { emoji: '💨', count: 3, distance: 30, size: 14 });
            if (b.job.prop === 'oven') anim(b.obj.querySelector('.kt-oven__win'), [{ opacity: 1 }, { opacity: 0.6 }, { opacity: 1 }], 300, { replace: true });
            return;
          }
          if (b.phase !== 'gold') { tooSoon(b); return false; }   // (in the air: it lands by itself)
          b.k = 1;
          if (b.job.end === 'out') {
            b.phase = 'done';
            b.obj.classList.add('is-out');
            sfx.play('good');
            finish(b);
            return;
          }
          sfx.play('whoosh');
          b.obj.classList.remove('is-gold');
          b.obj.classList.add('is-flipped');
          if (b.job.prop === 'pan' && !highDone && roll('high', 0.2)) {
            // a high flip: it lands on this chef's hat, then hops back into the pan
            highDone = true;
            b.phase = 'flying';
            b.busyUntil = ctx.time + 0.9;
            b.parts.food.classList.add('is-away');
            fly(b.job.e, b.parts.food, b.chef, { ms: 300, size: resultSize(), dy: -0.45, pop: false });
            var hat = el('span', { class: 'kt-onhat' }, ctx.sticker(b.job.e));
            ctx.after(RM ? 0 : 300, function () { b.chef.appendChild(hat); });
            later(600, function () {
              hat.remove();
              fly(b.job.e, b.chef, b.parts.food, { ms: 280, size: resultSize(), pop: false });
              sfx.play('boing'); sfx.play('giggle');
            });
            later(900, function () { b.parts.food.classList.remove('is-away'); b.phase = 'heat2'; S.sizzle(0.08); });
            return;
          }
          b.phase = 'flying';
          b.busyUntil = ctx.time + 0.6;
          anim(b.parts.food, [{ transform: 'translateY(0) rotate(0deg)' }, { transform: 'translateY(-120%) rotate(90deg)', offset: 0.45 }, { transform: 'translateY(0) rotate(180deg)' }], 560, { easing: 'ease-in-out' });
          later(600, function () { b.phase = 'heat2'; S.sizzle(0.08); burstAt(b.parts.food, { emoji: '💨', count: 3, distance: 30, size: 14 }); });
        },
        fetch: function (b, ev) {
          var jar = nearestIn(b, '.kt-jar', ev, 24);
          if (!jar) {
            b.parts.jars.forEach(function (j) { fx.wiggle(j); });
            sfx.play('tap');
            return false;
          }
          var inner = jar.querySelector('.kt-glass__in');
          if (jar === b.parts.right) {
            b.k = 1;
            jar.classList.add('is-open');
            sfx.play('pop');
            sfx.play('good');
            b.parts.result = inner;
            b.parts.jars.forEach(function (j) { if (j !== jar) j.setAttribute('aria-disabled', 'true'); });
            finish(b);
            return;
          }
          // a wrong jar: a funny non-event; the jars are bottomless and nothing changes
          b.wrongRow++;
          b.gapNext = JAR_GAP;
          var cat = u.helpers.cat ? shelfItem('cat') : null;
          if (cat && catSnacks < 2 && !away.cat) {
            catSnacks++;
            // the cat leaps down to the jar, gobbles what is in it (it shrinks the moment the cat lands) and goes back
            leap(cat, jar, 800, function () {
              sfx.play('munch'); S.purr();
              if (RM && inner.animate) inner.animate([{ opacity: 1 }, { opacity: 0, offset: 0.2 }, { opacity: 0, offset: 0.7 }, { opacity: 1 }], { duration: 600 });   // (no motion: it fades while the cat is there)
              else anim(inner, [{ transform: 'scale(1)' }, { transform: 'scale(0)', offset: 0.25 }, { transform: 'scale(0)', offset: 0.55 }, { transform: 'scale(1)' }], 640);
            });
          } else {
            anim(inner, [{ transform: 'translateY(0)' }, { transform: 'translateY(-55%)', offset: 0.3 }, { transform: 'translateY(-55%) rotate(-14deg)', offset: 0.45 }, { transform: 'translateY(-55%) rotate(14deg)', offset: 0.6 }, { transform: 'translateY(0)' }], 620);
            sfx.play('boing');
          }
          if (b.wrongRow >= 2) hint(b.parts.right, { delay: 1200 });
        },
        pick: function (b, ev) {
          var job = b.job;
          if (b.chosen == null) {
            var bowl = nearestIn(b, '.kt-bowl', ev, 24);
            if (!bowl) { b.parts.bowls.forEach(function (n) { fx.wiggle(n); }); sfx.play('tap'); return false; }
            // the choice: the other two slide away, this one moves to the middle. Every choice is right.
            b.chosen = +bowl.dataset.i;
            pickedChoice = b.chosen;
            b.parts.bowls.forEach(function (n) {
              if (n === bowl) { n.dataset.pos = '1'; n.classList.add('is-chosen'); }
              else { n.classList.add('is-gone'); n.setAttribute('aria-disabled', 'true'); }
            });
            b.parts.result = bowl;
            refreshPips();                                     // (the steps that use what she chose now show it)
            // the cicak on the shelf agrees with her choice (cek-cek-cek)
            var cicak = u.helpers.cicak ? shelfItem('cicak') : null;
            if (cicak) ctx.after(250, function () { if (cicak.isConnected) { fx.bounce(cicak); S.cek(); } });
          }
          var e = job.choices[b.chosen];
          fly(recipe.shape ? cookieEl(e, 'raw') : e, b.parts.bowls[b.chosen], vesselEl, { ms: 420, size: resultSize() });
          b.k++;
          countAloud(b.k);
          addPiece(e, true, { pick: true });                   // (what she chose is never pushed out of the dish)
          if (job.paint) {
            var to = job.paint[b.chosen];
            if (vessel.kind === 'cake') vessel.frost = mixColor('#FFF4E0', to, b.k / 3);
            else if (vessel.kind === 'plate' || vessel.kind === 'pizza') vessel.glaze = mixColor('#FFF4E0', to, b.k / 3);   // the donuts' glaze
            else { vessel.liq = mixColor(vessel.liq && vessel.liq !== 'transparent' ? vessel.liq : '#FFF4E0', to, 1 / 3 + (b.k - 1) / 3); vessel.level = Math.max(vessel.level, 0.3); }
            if (b.k === 1) { burstAt(b.parts.bowls[b.chosen], { count: 8, distance: 40, size: 10, colors: [to] }); sfx.play('splash'); }
          }
          ctx.after(RM ? 0 : 420, renderVessel);
          if (b.k >= b.n) sfx.play('star');
        },
        roll: function (b) {
          var p = b.parts, o = b.obj;
          if (!RM) anim(p.pin, [{ transform: 'translateX(-12%)' }, { transform: 'translateX(12%)' }, { transform: 'translateX(0)' }], 240);
          b.k++;
          if (b.k < b.n) {
            o.style.setProperty('--f', (b.k / (b.n - 1)).toFixed(2));
            S.fwump(); sfx.scale(b.k + 1);
            return;
          }
          o.style.setProperty('--f', '1');
          if (b.job.base) {
            o.classList.add('is-base');                      // the dough is the base: a crust ring
            S.fwump(); burstAt(p.dough, { emoji: '✨', count: 6, distance: 50, size: 16 });
            sfx.play('good');
          } else {
            o.classList.add('is-cut');                       // the cutter drops in and lifts out: a ring of dough
            S.chk(); sfx.play('pop'); sfx.play('good');
            p.result = p.cut;
          }
        },
        blend: function (b) {
          var p = b.parts;
          anim(p.btn, [{ transform: 'translateY(0)' }, { transform: 'translateY(8%)' }, { transform: 'translateY(0)' }], 140);
          anim(p.swirl, [{ transform: 'rotate(0deg)' }, { transform: 'rotate(120deg)' }], 300);
          b.turns++;
          vesselEl.style.setProperty('--spin' + b.side, (b.turns * 90) + 'deg');
          fx.shake(contentsEl);
          S.whirr(b.k); sfx.scale(b.k + 2);
          b.k++;
          b.obj.style.setProperty('--fillk', (0.3 + 0.7 * b.k / b.n).toFixed(2));
          if (b.k >= b.n) { p.btn.classList.add('is-done'); sfx.play('good'); }
        },
        spread: function (b) {
          var band = b.parts.bands[b.k];
          if (band) band.classList.add('is-on');
          // (the knife on the right-hand board is mirrored in CSS, so the same sweep goes the other way)
          anim(b.parts.knife, [{ transform: 'translateX(-25%)' }, { transform: 'translateX(35%)' }, { transform: 'translateX(0)' }], 220);
          S.smear(b.k); sfx.scale(b.k + 1);
          b.k++;
          b.obj.style.setProperty('--sy', String(knifeY(Math.min(b.k, b.n - 1), b.n)));
          if (b.k < b.n) return;
          b.obj.classList.add('is-spread');
          burstAt(b.parts.bread, { emoji: '✨', count: 6, distance: 50, size: 16 });
          sfx.play('good');
          if (b.job.smear && !smearDone && roll('smear', 0.25)) {
            // the knife flicks a blob of her spread onto her chef's face; it stays there for the round
            smearDone = true;
            var c = b.job.c;
            ctx.after(150, function () {
              if (!b.chef.isConnected) return;
              burstAt(b.chef, { count: 4, distance: 30, size: 10, colors: [c] });
              b.smear.style.setProperty('--c', c);
              b.el.classList.add('has-smear');
              sfx.play('boing'); sfx.play('giggle');
            });
          }
        },
        ball: function (b) {
          var p = b.parts;
          anim(p.hands, [{ transform: 'translateY(0)' }, { transform: 'translateY(55%) scale(1, 0.9)' }, { transform: 'translateY(0)' }], 200);
          S.pat(b.k); sfx.scale(b.k + 1);
          b.k++;
          b.turns++;
          b.obj.style.setProperty('--r', (b.k / b.n).toFixed(2));
          b.obj.style.setProperty('--spin', (b.turns * 40) + 'deg');
          if (b.job.e === 'kepal') burstAt(p.lump, { emoji: '❄️', count: 2, distance: 30, size: 12 });
          if (p.sugar) {
            if (b.k === 1) { p.sugar.classList.add('is-in'); anim(p.sugar, [{ transform: 'translateY(-200%)' }, { transform: 'translateY(0)' }], 220); sfx.play('drop'); }   // the secret
            else p.sugar.classList.add('is-wrapped');                                                     // (the dough wraps it)
          }
          if (b.k >= b.n) { b.obj.classList.add('is-round'); sfx.play('boing', { pitch: 700 }); sfx.play('good'); }
        },
        squeeze: function (b) {
          var job = b.job, p = b.parts;
          S.squish(b.k);
          if (job.prop === 'press') {
            sfx.scale(b.k + 1);                                // (the bag counts aloud instead: one note a squeeze)
            anim(p.plunger, [{ transform: 'translateY(0)' }, { transform: 'translateY(150%)' }, { transform: 'translateY(0)' }], 220);
            b.k++;
            b.obj.style.setProperty('--sq', (b.k / b.n).toFixed(2));
            for (var i = 0; i < 3; i++) {
              var w = p.worms.children.length >= 12 ? p.worms.firstChild : el('i', { class: 'kt-worm' });   // (at most 12: the oldest is reused)
              w.style.left = Math.round(util.randf(6, 74)) + '%';
              w.style.top = Math.round(util.randf(10, 72)) + '%';
              w.style.setProperty('--wr', Math.round(util.randf(-30, 30)) + 'deg');
              p.worms.appendChild(w);
              anim(w, [{ transform: 'translateY(-0.22em)' }, { transform: 'translateY(0)' }], 260);
            }
            if (b.k >= b.n) {
              // one extra-long worm boings out
              var long = el('i', { class: 'kt-longworm' });
              b.obj.appendChild(long);
              anim(long, [{ transform: 'scaleY(0.2)' }, { transform: 'scaleY(1.15)' }, { transform: 'scaleY(1)' }], 300, { easing: 'cubic-bezier(.3, 1.6, .5, 1)' });
              sfx.play('boing'); sfx.play('giggle'); sfx.play('good');
            }
            return;
          }
          anim(p.bag, [{ transform: 'scale(1, 1)' }, { transform: 'scale(1.12, 0.86)' }, { transform: 'scale(1, 1)' }], 200);
          fly(el('span', { class: 'kt-drop', style: { '--c': job.liquid } }), p.bag, vesselEl, { ms: 350, size: resultSize() * 0.6 });
          b.k++;
          if (job.out === 'dots') {
            addDots(job.liquid, 3);
            p.dots.appendChild(el('i', { style: { '--c': job.liquid, left: (18 + ((b.k * 37) % 64)) + '%' } }));
          } else { if (vessel.drizzles.length >= 4) vessel.drizzles.shift(); vessel.drizzles.push(job.liquid); vessel.added++; }
          countAloud(b.k);
          ctx.after(RM ? 0 : 350, renderVessel);
          if (b.k >= b.n) { b.obj.classList.add('is-empty'); sfx.play('good'); }
        },
        pop: function (b) {
          var p = b.parts;
          b.k++;
          b.obj.style.setProperty('--crk', (b.k / b.n).toFixed(2));
          if (b.k < b.n) {
            var a = 8 + 6 * b.k;
            anim(p.set, [{ transform: 'rotate(' + -a + 'deg)' }, { transform: 'rotate(' + a + 'deg)' }, { transform: 'rotate(0deg)' }], 220);
            fx.shake(p.mould); S.krk(); sfx.scale(b.k + 1);
            burstAt(p.mould, { emoji: '❄️', count: 2, distance: 30, size: 12 });
            return;
          }
          b.obj.classList.add('is-pop');
          S.thwop(); sfx.play('pop'); sfx.play('good');
          burstAt(p.set, { emoji: '✨', count: 6, distance: 50, size: 16 });
        },
        taste: function (b) {
          var hot = recipe.taste === 'hot', cold = recipe.taste === 'cold', freeze = recipe.gag === 'freeze';
          b.k = 1;
          b.busyUntil = ctx.time + 0.7;
          anim(b.parts.spoon, [{ transform: 'translateY(0) rotate(0deg)' }, { transform: 'translateY(30%) rotate(-20deg)' }, { transform: 'translateY(-40%) rotate(10deg)' }, { transform: 'translateY(0)' }], 600);
          var yum = function () {
            faceSwap(b, util.pick(FACES), 1500);
            burstAt(b.chef, { emoji: '💕', count: 5, distance: 40, size: 16 });
            sfx.play('munch'); S.mmm();
          };
          if (hot) { burstAt(b.obj, { emoji: '💨', count: 4, distance: 40, size: 16 }); S.fuu(); ctx.after(350, yum); }
          else if (cold) {
            // (es kepal: a brain freeze, a longer shiver)
            var fz = freeze ? 900 : 500;
            faceSwap(b, '🥶', fz); fx.shake(b.chef); S.brr();
            if (freeze) { burstAt(b.chef, { emoji: '❄️', count: 4, distance: 40, size: 14 }); ctx.after(300, function () { if (b.chef.isConnected) { fx.shake(b.chef); S.brr(); } }); }
            ctx.after(fz, yum);
          }
          else yum();
          gag(b, true);
          b.munchAt = ctx.time;
          finish(b);
        },
        blow: function (b) {
          var c = b.parts.candles[b.k];
          if (c) c.classList.add('is-out');
          burstAt(b.chef, { emoji: '💨', count: 3, distance: 36, size: 16 });
          if (vessel.candles) {
            var ci = b.side * 3 + b.k, cn = contentsEl.querySelectorAll('.kt-candles .kt-candle')[ci];
            vessel.candles[ci] = false;
            if (cn) cn.classList.add('is-out'); else renderVessel();       // (the flame fades; nothing else moves)
          }
          sfx.scale(2 + 2 * b.k);
          b.k++;
          ctx.say(b.k);
          if (b.k >= b.n) sfx.play('good');
        },
      };

      function countAloud(k) { sfx.scale(k + 1); ctx.say(k); }

      /** Where the butter knife rests (top, % of the object): over stripe k of n on the slice. */
      function knifeY(k, n) { return Math.round((20 + 0.56 * (12 + (k + 0.5) * 76 / n) - 6) * 10) / 10; }

      /** The dish's own laugh at tasting (decoration only, on the taster's own chef). first: the first taste;
       *  else a munch-more tap (the small version). */
      function gag(b, first) {
        var g = recipe && recipe.gag, chef = b.chef;
        var at = function (ms, fn) { ctx.after(ms, function () { if (chef.isConnected) fn(); }); };
        if (g === 'squirt') at(first ? 250 : 0, function () {
          S.splat();
          burstAt(chef, { count: 6, distance: 40, size: 10, colors: ['#7A4320', '#B8742E'] });
          b.el.classList.add('has-splat');                     // (a blob of palm sugar stays on the chef for the round)
        });
        else if (g === 'crunch') { S.crunch(); burstAt(chef, { count: 6, distance: 36, size: 8, colors: ['#D9A35A', '#B9783A'] }); }
        else if (g === 'peel') {
          var top = vessel.bands.length ? vessel.bands[vessel.bands.length - 1] : variantColour();
          fly(el('span', { class: 'kt-peelfly', style: { '--c': top } }), vesselEl, chef, { ms: 400, pop: false });
          S.sret();
        }
        else if (g === 'tongue') at(first ? 600 : 0, function () {
          faceSwap(b, '😛', 1400);
          b.tongue.style.setProperty('--c', variantColour());
          b.el.classList.add('has-tongue');
          var gen = ++b.tongueGen;
          ctx.after(1400, function () { if (b.tongueGen === gen) b.el.classList.remove('has-tongue'); });
        });
        else if (g === 'worm') at(first ? 600 : 0, function () {
          var w = el('span', { class: 'kt-wormdangle', style: { '--c': variantColour() } });
          // a fat, wriggly worm in her colour (an outline, her colour, a shine), hanging from the mouth
          w.innerHTML = '<svg viewBox="0 0 40 72" aria-hidden="true"><path class="o" d="M20 8 C 8 20, 32 30, 20 42 S 9 56, 20 64"/><path class="c" d="M20 8 C 8 20, 32 30, 20 42 S 9 56, 20 64"/><path class="s" d="M16 16 C 12 20, 14 24, 18 28"/></svg>';
          chef.appendChild(w);
          ctx.after(700, function () {
            if (!w.isConnected) return;
            S.slurp();
            w.classList.add('is-up');                          // slurped up
            ctx.after(RM ? 0 : 320, function () { w.remove(); });
          });
        });
        else if (g === 'freeze' && !first) { S.brr(); faceSwap(b, '🥶', 400); }
      }

      function crackLine(b) {
        b.obj.style.setProperty('--crack', String(Math.min(1, b.k / Math.max(1, b.n - 1))));
        b.obj.classList.add('is-cracked');
        S.krk();
        fx.shake(b.parts.egg);
      }

      /** The egg opens: a yolk drops in the bowl (two, sometimes!) — or, now and then, a chick hops out instead. */
      function openEgg(b) {
        if (b.done || state !== 'beat') return;
        var chick = !b.replaced && !chickThisRound && kit.done >= 1 && kit.chicks < 3 && roll('chick', 1 / 6);
        b.obj.classList.add('is-open');
        b.obj.dataset.k = String(b.k);
        if (chick) {
          chickThisRound = true;
          kit.chicks++;
          save();
          var c = el('span', { class: 'kt-chick' }, ctx.sticker('🐣'));
          b.obj.appendChild(c);
          S.peep(); sfx.play('giggle');
          b.k = 0;
          b.busyUntil = ctx.time + 1.5;
          later(450, function () {
            buildShelf(); fit();
            var spots = wallEl.querySelectorAll('.kt-item--chick');
            fly('🐣', c, spots[spots.length - 1] || wallEl, { ms: 450 });
            c.classList.add('is-gone');
          });
          later(600, function () {
            // a fresh egg rolls in (it never surprises)
            b.replaced = true;
            b.obj.classList.remove('is-open', 'is-cracked');
            b.obj.style.setProperty('--crack', '0');
            b.obj.dataset.k = '0';
            b.parts.yolks.textContent = '';
            anim(b.parts.egg, [{ transform: 'translateX(' + (b.side ? 120 : -120) + '%) rotate(' + (b.side ? 300 : -300) + 'deg)' }, { transform: 'translateX(0) rotate(0deg)' }], 450, { replace: true });
            sfx.play('roll');
          });
          return;
        }
        var two = roll('double', 1 / 6);
        b.parts.yolks.appendChild(el('span', { class: 'kt-yolk' }));
        if (two) b.parts.yolks.appendChild(el('span', { class: 'kt-yolk' }));
        sfx.play('drop');
        sfx.play('good');
        finish(b);
      }

      /* ---- the wall: vessel, pips, shelf. Taps there only ever cheer. ---- */

      function onWall(ev) {
        lastHinted = null;
        var t = ev.target && ev.target.closest ? ev.target : wallEl;
        if (ctx.time - wallAt < 0.15) { squash(t.closest('.kt-item, .kt-pip') || vesselEl); return; }   // (never silent: a squash)
        wallAt = ctx.time;
        var item = t.closest('.kt-item');
        if (item) {
          fx.bounce(item);
          var k = item.dataset.kind;
          if (k === 'cat') S.meow(); else if (k === 'hen') S.cluck(); else if (k === 'chick') S.peep(); else if (k === 'cicak') S.cek(); else if (k === 'radio') sfx.scale(util.rand(8) + 3); else sfx.play('pop');
          return;
        }
        var pip = t.closest('.kt-pip');
        if (pip) { fx.wiggle(pip); sfx.play('tick'); return; }
        var sign = t.closest('.kt-sign');
        if (sign) { fx.wiggle(sign); sfx.play('pop', { pitch: 520 }); return; }
        fx.wiggle(contentsEl);
        sfx.play('pop', { pitch: 600 + 60 * (wallC++ % 8) });
      }

      /* ---- input ---- */

      ctx.tap(pageEl, function (ev, card) {
        lastHinted = null;
        menuTap = ctx.time;
        if (ev.target && ev.target.closest && ev.target.closest('.kt-next')) return;   // (slop never snaps the present onto a card)
        pick(card.dataset.id, card);
      }, { delegate: '.kt-card', slop: 24 });
      ctx.tap(railEl, onTab, { delegate: '.kt-tab', slop: 12 });   // (its own container: slop never turns a tab tap into a card)
      boards.forEach(function (b) { ctx.tap(b.el, function (ev) { onBoard(b.side, ev); }); });
      ctx.tap(wallEl, onWall);

      function save() {
        try { ctx.save('kitchen', { v: 3, done: kit.done, legacy: kit.legacy, legacy2: kit.legacy2, cooked: kit.cooked, made: kit.made, chicks: kit.chicks, seen: kit.seen }); } catch (e) { /* storage may be unavailable */ }
      }

      /* ---- the clocks: cooking, and the quiet ghost hand ---- */

      ctx.every(100, cookTick);
      ctx.every(200, function () {
        if (lastHinted) return;
        if (state === 'menu') { if (ctx.time - menuTap > (kit.done ? 4 : 0.6)) hintNext(); return; }
        if (state !== 'beat') return;
        var s = !boards[aSide].done ? aSide : !boards[bSide].done ? bSide : -1;
        if (s >= 0 && ctx.time - lastTap[s] > idleFor(s)) hintNext();
      });

      /* ---- go ---- */

      buildMenu();
      buildShelf();
      renderTier();
      fit();
      ctx.onResize(fit);
      ctx.setTurn(ctx.firstPlayer, { lock: 0 });      // who chooses: only a suggestion (anyone may tap), and no lock
      // a kitchen saved before this menu grew (v1 or v2) and with a present to come: once, the tab (or the next card's
      // present) that holds it bounces and sparkles. The save written just below is v3, so it never shows again.
      var oldSave = !!raw && typeof raw === 'object' && !Array.isArray(raw) && !(raw.v === 3 || Object.prototype.hasOwnProperty.call(raw, 'legacy2'));
      if (oldSave && kit.done > 0 && u.next) {
        news = GROUP_OF[u.next].id;
        ctx.after(400, function () {
          if (state !== 'menu') return;
          var tgt = hasTabs() ? railEl.querySelector('.kt-tab[data-group="' + news + '"]') : pageEl.querySelector('.kt-next .kt-next__tag');
          if (!tgt || !tgt.isConnected) return;
          [0, 250, 500].forEach(function (d) { ctx.after(d, function () { if (tgt.isConnected) fx.bounce(tgt); }); });
          burstAt(tgt, { emoji: '✨', count: 10, distance: 60, size: 16 });
          sfx.play('star');
        });
      }
      save();

      ctx.expose({
        get state() { return state; },
        get recipe() { return recipeId; },
        get beat() { return beatI; },
        get beats() { return beats.map(function (bt) { return { extra: !!bt.extra, serve: bt.serve || null, a: bt.a.do, b: bt.b.do }; }); },
        get boards() { return boards.map(function (b) { return { side: b.side, role: b.side === aSide ? 'a' : 'b', do: b.verb, e: b.job ? b.job.e || null : null, n: b.n, k: b.k, done: b.done, phase: b.phase, heat: b.heat, chosen: b.chosen, prop: b.job ? b.job.prop || null : null, variant: b.job ? b.job.e || null : null }; }); },
        /** The bowl she chose this round (null until she chooses). */
        get variant() { return pickedChoice; },
        /** The menu's open group tab (null when the menu is one page). */
        get tab() { return activeTab; },
        /** The group the once-only "new menu" sparkle pointed at when the kitchen opened (null when none). */
        get news() { return news; },
        GROUPS: GROUPS,
        LIST: LIST.length,
        get kitchen() { return JSON.parse(JSON.stringify(kit)); },
        get aSide() { return aSide; },
        /** The element the ghost hand last pointed at (tests follow it). */
        get hinted() { return lastHinted; },
        get catSnacks() { return catSnacks; },
        /** `pieces` counts everything ever added (it only goes up); `contents` is what is in the dish now. */
        get vessel() {
          return { kind: vessel.kind, pieces: vessel.added, level: vessel.level, fill: fill, liq: vessel.liq, frost: vessel.frost, mix: vessel.mix,
            contents: vessel.pieces.map(function (p) { return p.e; }), kept: vessel.pieces.filter(function (p) { return p.keep; }).map(function (p) { return p.e; }),
            blobs: vessel.blobs.slice(), rim: vessel.rim.map(function (r) { return r.e; }), dots: vessel.dots.length, drizzles: vessel.drizzles.length, layers: vessel.layers,
            picks: vessel.pieces.filter(function (p) { return p.pick; }).map(function (p) { return p.e; }), scoops: vessel.scoops.slice(), base: vessel.base, baked: vessel.baked,
            sauce: vessel.sauce, glaze: vessel.glaze, jellies: vessel.pieces.filter(function (p) { return p.e === 'jelly'; }).map(function (p) { return p.c; }),
            dotColors: vessel.dots.map(function (d) { return d.c; }), bands: vessel.bands.slice(), plate: vesselEl.dataset.plate || '',
            tokens: vessel.pieces.filter(function (p) { return TOKENS.indexOf(p.e) >= 0; }).map(function (p) { return { e: p.e, c: p.c }; }),
            cookies: vessel.pieces.filter(function (p) { return p.baked && isShape(p.e); }).map(function (p) { return p.e; }) };
        },
        get locked() { return ctx.locked; },
        get events() { return events.slice(); },
        hintNext: hintNext,
        start: function (id) { pick(id, menuEl.querySelector('.kt-card[data-id="' + id + '"]')); },
        setKitchen: function (raw) {
          if (state !== 'menu') return false;
          kit = cleanKitchen(raw); u = unlocks(kit.done, kit.legacy, kit.legacy2); save();
          buildMenu(); buildShelf(); renderTier(); fit();
          hint(null); menuTap = ctx.time;
          return true;
        },
        /** Fast-forward board s's cooking until it changes phase (golden, or finished by itself). */
        cook: function (s) { var b = boards[s], p = b.phase; for (var i = 0; i < 400 && b.phase === p && !b.done; i++) heatStep(b); return b.phase; },
        /** Force the next surprise roll(s): {chick, double, sneeze, high}. */
        surprise: function (o) { Object.keys(o || {}).forEach(function (k) { if (o[k]) forced[k] = true; else delete forced[k]; }); },
        /** Tests: go straight to beat i of the dish being cooked. */
        jump: function (i) {
          if (state !== 'beat' && state !== 'merge') return false;
          i = Math.max(0, Math.min(beats.length - 1, i));
          for (var j = 0; j < i; j++) if (beats[j].serve) {
            vessel = newVessel(beats[j].serve);
            if (vessel.kind === 'cake') vessel.layers = 2;
            if (vessel.kind === 'cone') vessel.scoops = [variantColour(), variantColour()];
          }
          if (vessel.kind === 'pizza' && i > 0) vessel.base = true;
          vesselEl.classList.remove('is-out', 'is-baking', 'has-lid');   // (a jump from the middle of a merge: no flourish is left half-done)
          fill = i / beats.length;
          renderVessel();
          startBeat(i);
          return true;
        },
        cleanKitchen: cleanKitchen,
        unlocks: unlocks,
        giftFor: giftFor,
        giftV1: giftV1,
        giftV2: giftV2,
        restAfter: restAfter,
        restAfter3: restAfter3,
        MENU_V2: MENU_V2,
        GIFTS3: GIFTS3.length,
        LIST3: LIST3.length,
        resolveJob: function (job, V, id) { return resolveJob(job, pickOf(RECIPES[id || recipeId]), V); },
        nFor: nFor,
        beatsFor: beatsFor,
        resultOf: resultOf,
        RECIPES: RECIPES,
        MENU: MENU,
        VERBS: VERBS,
        GIFTS: GIFTS.length,
        tuning: { GAP: GAP, CRACK_GAP: CRACK_GAP, PICK_GAP: PICK_GAP, JAR_GAP: JAR_GAP, COOK_S: COOK_S, LATCH: LATCH, TAPS: TAPS, cookS: [COOK_S[ctx.helpFor(0)], COOK_S[ctx.helpFor(1)]] },
      });

      return function cleanup() { save(); };
    },
  });
})();
