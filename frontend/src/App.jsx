import React, { useState } from 'react'
import { motion } from 'framer-motion'
import "./index.css"

const Button = ({ children, ...props }) => (
  <button {...props} className={'px-3 py-2 rounded border ' + (props.className || '')}>{children}</button>
);

const Card = ({ children, className = '', style = {} }) => (
  <div className={'border rounded p-4 bg-white shadow ' + className} style={style}>{children}</div>
);

export default function App() {
  const [playerId, setPlayerId] = useState('');
  const [level, setLevel] = useState(1);
  const [sessionId, setSessionId] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [answers, setAnswers] = useState({});
  const [result, setResult] = useState(null);

  const api = 'http://localhost:3000';

const matchPlayer = async () => {
  if (!playerId) return alert('Enter playerId');

  const res = await fetch(`${api}/match`, {
    method: 'POST',
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ playerId, level })
  });

  const data = await res.json();

  if (data.sessionId) setSessionId(data.sessionId);

  alert(JSON.stringify(data));
};

  const startSession = async () => {
    if (!sessionId) return alert('No sessionId');
    const res = await fetch(`${api}/session/${sessionId}/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerId })
    }).then(r => r.json());
    setQuestions(res.questions || []);
  };

  const submitAnswer = async (index, answer) => {
    if (!sessionId) return alert('No sessionId');
    await fetch(`${api}/session/${sessionId}/answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerId, questionIndex: index, answer })
    });
    setAnswers(prev => ({ ...prev, [index]: answer }));
  };

  const getResult = async () => {
    const res = await fetch(`${api}/session/${sessionId}/result`).then(r => r.json());
    setResult(res);
  };

  return (
    <div style={{ padding: 20, maxWidth: 800, margin: '0 auto' }}>
      <motion.h1 initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ textAlign: 'center' }}>
        Multiplayer Quiz Game
      </motion.h1>

      <Card style={{ marginTop: 20 }}>
        <h2>Player Setup</h2>
        <input placeholder="Player ID" value={playerId} onChange={e => setPlayerId(e.target.value)} style={{ width: '100%', padding: 8, marginTop: 8 }} />
        <select value={level} onChange={e => setLevel(Number(e.target.value))} style={{ width: '100%', padding: 8, marginTop: 8 }}>
          <option value={1}>Level 1</option>
          <option value={2}>Level 2</option>
          <option value={3}>Level 3</option>
        </select>
        <div style={{ marginTop: 10 }}>
          <Button onClick={matchPlayer} className='w-full'>Match Player</Button>
        </div>
      </Card>

      {sessionId && (
        <Card style={{ marginTop: 12 }}>
          <h3>Session: {sessionId}</h3>
          <div style={{ marginTop: 8 }}>
            <Button onClick={startSession}>Start Quiz</Button>
          </div>
        </Card>
      )}

      {questions.length > 0 && (
        <Card style={{ marginTop: 12 }}>
          <h3>Questions</h3>
          {questions.map((q, index) => (
            <Card key={index} style={{ marginTop: 8 }}>
              <div style={{ fontWeight: 600 }}>{index + 1}. {q.question}</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
                {q.choices.map((c, i) => (
                  <Button key={i} onClick={() => submitAnswer(index, i)} style={{ textAlign: 'left' }}>
                    {c}
                  </Button>
                ))}
              </div>
            </Card>
          ))}
          <div style={{ marginTop: 12 }}>
            <Button onClick={getResult}>Get Result</Button>
          </div>
        </Card>
      )}

      {result && (
        <Card style={{ marginTop: 12 }}>
          <h3>Result</h3>
          <pre style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify(result, null, 2)}</pre>
        </Card>
      )}
    </div>
  )
}
