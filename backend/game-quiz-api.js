/*
Simple Game Matching & Quiz API (Node.js + Express)
Run: npm install && npm start
*/
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const { randomUUID, createHash } = require('crypto');

const app = express();
app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type"]
}));

// Important: Handle preflight requests
app.options('*', (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.sendStatus(200);
});

app.use(bodyParser.json());

// --- Simple question bank ---
const QUESTIONS = [
  { id: 'q1', level: 1, question: '2 + 2 = ?', choices: ['3','4','5','6'], correct: 1 },
  { id: 'q2', level: 1, question: 'Capital of France?', choices: ['Paris','Rome','Berlin','Madrid'], correct: 0 },
  { id: 'q3', level: 1, question: 'Color of the sky on clear day?', choices: ['Blue','Green','Red','Yellow'], correct: 0 },
  { id: 'q4', level: 2, question: 'What is 12 * 12?', choices: ['144','154','134','124'], correct: 0 },
  { id: 'q5', level: 2, question: 'Which gas is essential for respiration?', choices: ['Nitrogen','Oxygen','Hydrogen','Carbon Dioxide'], correct: 1 },
  { id: 'q6', level: 2, question: 'Square root of 256?', choices: ['14','15','16','18'], correct: 2 },
  { id: 'q7', level: 3, question: 'Derivative of x^2?', choices: ['x','2x','x^2','2'], correct: 1 },
  { id: 'q8', level: 3, question: 'HTTP status code for Not Found?', choices: ['200','301','404','500'], correct: 2 },
  { id: 'q9', level: 3, question: 'Which algorithm is O(n log n)?', choices: ['Bubble sort','Merge sort','Selection sort','Insertion sort'], correct: 1 },
  { id: 'q10', level: 1, question: 'Which animal barks?', choices: ['Cat','Cow','Dog','Snake'], correct: 2 },
  { id: 'q11', level: 2, question: 'What is H2O?', choices: ['Salt','Water','Oxygen','Hydrogen'], correct: 1 },
  { id: 'q12', level: 3, question: 'Binary of decimal 10?', choices: ['1010','1001','1100','1110'], correct: 0 },
];

// --- In-memory state ---
const queuesByLevel = {}; // level -> array of waiting player objects { playerId, queuedAt }
const sessions = {}; // sessionId -> session object

const SESSION_QUESTIONS = 10;
const SESSION_TIMEOUT_MS = 120_000; // 2 minutes

function seededRandomFactory(seed) {
  let counter = 0;
  return function() {
    const h = createHash('sha256');
    h.update(seed + ':' + (counter++));
    const digest = h.digest();
    const v = digest.readUInt32BE(0);
    return v / 0xFFFFFFFF;
  }
}

function seededShuffle(array, seed) {
  const arr = array.slice();
  const rnd = seededRandomFactory(seed);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function createSession(playerA, playerB, level) {
  const sessionId = randomUUID();
  const pool = QUESTIONS.filter(q => q.level === level);
  const poolToUse = pool.length >= SESSION_QUESTIONS ? pool : QUESTIONS;
  const shuffled = seededShuffle(poolToUse, sessionId);
  const selected = shuffled.slice(0, Math.min(SESSION_QUESTIONS, shuffled.length));
  const session = {
    id: sessionId,
    level,
    players: {
      [playerA.playerId]: { playerId: playerA.playerId, answers: {}, startedAt: null, finishedAt: null },
      [playerB.playerId]: { playerId: playerB.playerId, answers: {}, startedAt: null, finishedAt: null },
    },
    questions: selected.map(q => ({ id: q.id, question: q.question, choices: q.choices, _correct: q.correct })),
    createdAt: Date.now(),
    finished: false,
    result: null,
  };
  sessions[sessionId] = session;
  return session;
}

app.post('/match', (req, res) => {
  const { playerId, level } = req.body;
  if (!playerId || typeof level === 'undefined') return res.status(400).json({ error: 'playerId and level required' });
  queuesByLevel[level] = queuesByLevel[level] || [];
  const queue = queuesByLevel[level];
  const now = Date.now();
  while (queue.length > 0 && now - queue[0].queuedAt > SESSION_TIMEOUT_MS) {
    queue.shift();
  }
  if (queue.length === 0) {
    queue.push({ playerId, queuedAt: Date.now() });
    return res.json({ status: 'queued', message: 'Waiting for another player at same level' });
  } else {
    const other = queue.shift();
    const session = createSession({ playerId }, { playerId: other.playerId }, level);
    return res.json({ status: 'matched', sessionId: session.id, opponent: other.playerId });
  }
});

app.post('/session/:id/start', (req, res) => {
  const session = sessions[req.params.id];
  if (!session) return res.status(404).json({ error: 'session not found' });
  const { playerId } = req.body;
  if (!playerId || !session.players[playerId]) return res.status(400).json({ error: 'invalid playerId for this session' });
  const player = session.players[playerId];
  if (!player.startedAt) player.startedAt = Date.now();
  const qs = session.questions.map((q, idx) => ({ index: idx, id: q.id, question: q.question, choices: q.choices }));
  return res.json({ sessionId: session.id, questions: qs });
});

app.post('/session/:id/answer', (req, res) => {
  const session = sessions[req.params.id];
  if (!session) return res.status(404).json({ error: 'session not found' });
  const { playerId, questionIndex, answer, answeredAt } = req.body;
  if (!playerId || typeof questionIndex !== 'number' || typeof answer === 'undefined') {
    return res.status(400).json({ error: 'playerId, questionIndex, answer required' });
  }
  const player = session.players[playerId];
  if (!player) return res.status(400).json({ error: 'player not part of session' });
  if (questionIndex < 0 || questionIndex >= session.questions.length) return res.status(400).json({ error: 'invalid questionIndex' });
  const answeredAtTs = answeredAt ? new Date(answeredAt).getTime() : Date.now();
  player.answers[questionIndex] = { answer, answeredAt: answeredAtTs };
  if (Object.keys(player.answers).length >= session.questions.length && !player.finishedAt) {
    const times = Object.values(player.answers).map(a => a.answeredAt);
    player.finishedAt = Math.max(...times);
  }
  const playerIds = Object.keys(session.players);
  const p1 = session.players[playerIds[0]];
  const p2 = session.players[playerIds[1]];
  if (p1.finishedAt && p2.finishedAt && !session.finished) {
    session.result = computeResult(session);
    session.finished = true;
  }
  return res.json({ status: 'ok', playerProgress: { answered: Object.keys(player.answers).length, total: session.questions.length } });
});

app.get('/session/:id/result', (req, res) => {
  const session = sessions[req.params.id];
  if (!session) return res.status(404).json({ error: 'session not found' });
  if (!session.finished) {
    const now = Date.now();
    if (now - session.createdAt > SESSION_TIMEOUT_MS) {
      session.result = computeResult(session, true);
      session.finished = true;
    } else {
      return res.json({ status: 'pending', message: 'session not finished yet' });
    }
  }
  return res.json({ status: 'finished', result: session.result });
});

function computeResult(session, allowPartial = false) {
  const players = Object.values(session.players);
  const perPlayer = players.map(p => {
    let correct = 0;
    const times = [];
    for (let i = 0; i < session.questions.length; i++) {
      const given = p.answers[i];
      if (given) {
        times.push(given.answeredAt);
        const correctIndex = session.questions[i]._correct;
        if (given.answer === correctIndex) correct++;
      }
    }
    const answeredCount = Object.keys(p.answers).length;
    const finishedAt = p.finishedAt || null;
    const totalTime = (finishedAt && p.startedAt) ? (finishedAt - p.startedAt) : null;
    return { playerId: p.playerId, correct, answeredCount, totalTime, finishedAt };
  });
  perPlayer.sort((a,b) => {
    if (b.correct !== a.correct) return b.correct - a.correct;
    if (a.totalTime != null && b.totalTime != null && a.totalTime !== b.totalTime) return a.totalTime - b.totalTime;
    if (a.finishedAt && b.finishedAt && a.finishedAt !== b.finishedAt) return a.finishedAt - b.finishedAt;
    return 0;
  });
  const top = perPlayer[0];
  const runnerUp = perPlayer[1];
  let outcome = 'draw';
  if (top.correct !== runnerUp.correct) outcome = 'winner';
  else if (top.totalTime != null && runnerUp.totalTime != null && top.totalTime !== runnerUp.totalTime) outcome = 'winner';
  else if (top.finishedAt && runnerUp.finishedAt && top.finishedAt !== runnerUp.finishedAt) outcome = 'winner';
  else outcome = 'draw';
  const winner = outcome === 'winner' ? top.playerId : null;
  return { players: perPlayer, winner, outcome };
}

app.get('/', (req, res) => res.send('Game Quiz API running'));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Listening on', PORT));
