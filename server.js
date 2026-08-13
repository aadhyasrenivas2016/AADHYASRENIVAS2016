require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;
const OLLAMA_BASE_URL = (process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434').replace(/\/$/, '');
const OPENAI_BASE_URL = (process.env.OPENAI_API_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
const VIBE_API_URL = (process.env.VIBE_API_URL || 'https://vibe-proxy-gqv4.onrender.com/v1/chat/completions').replace(/\/$/, '');
const VIBE_API_KEY = process.env.VIBE_API_KEY || 'sk-vibe-summer-2026';
const LLM_PROVIDER = (process.env.LLM_PROVIDER || 'ollama').toLowerCase();

const teacherProfiles = {
  math: {
    name: 'Math Teacher',
    badge: 'Mathematics',
    intro: 'Ask me anything about numbers, patterns, formulas, or problem-solving, and I’ll explain it in a friendly way.',
    focus: ['algebra', 'equation', 'geometry', 'calculus', 'statistics', 'fraction', 'percentage', 'function', 'solve', 'graph', 'ratio'],
    systemPrompt: 'You are the Math Teacher. Teach in a clear, friendly, step-by-step style. Explain equations, variables, geometry, functions, ratios, percentages, and proofs without sounding robotic.'
  },
  physics: {
    name: 'Physics Teacher',
    badge: 'Physics',
    intro: 'Let’s explore motion, forces, energy, and the laws behind how the universe behaves.',
    focus: ['force', 'motion', 'velocity', 'acceleration', 'energy', 'mass', 'momentum', 'gravity', 'kinetic', 'potential', 'newton', 'work'],
    systemPrompt: 'You are the Physics Teacher. Explain physics with clear examples, diagrams in words, and straightforward reasoning. Focus on force, motion, acceleration, gravity, energy, momentum, and laws of motion.'
  },
  science: {
    name: 'Science Teacher',
    badge: 'Science',
    intro: 'I can help with biology, chemistry, experiments, and the scientific method in everyday life.',
    focus: ['biology', 'chemistry', 'experiment', 'cell', 'ecosystem', 'atom', 'reaction', 'lab', 'energy', 'plant', 'human body', 'scientific method'],
    systemPrompt: 'You are the Science Teacher. Teach using simple, engaging explanations rooted in evidence and the scientific method. Cover biology, chemistry, experiments, and everyday scientific thinking.'
  }
};

const conversationHistory = {
  math: [],
  physics: [],
  science: []
};

function findKeywordMatch(question, topics) {
  const normalized = question.toLowerCase();
  return topics.some((topic) => normalized.includes(topic));
}

function routeQuestion(question) {
  const cleanQuestion = question.trim();
  if (!cleanQuestion) return 'math';

  const scores = {};
  Object.entries(teacherProfiles).forEach(([key, teacher]) => {
    scores[key] = teacher.focus.reduce((total, topic) => total + (findKeywordMatch(cleanQuestion, [topic]) ? 1 : 0), 0);
  });

  const ordered = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  return ordered[0] && ordered[0][1] > 0 ? ordered[0][0] : 'math';
}

function buildHistoryMessages(teacherKey, incomingHistory = []) {
  const priorMessages = Array.isArray(incomingHistory) ? incomingHistory : [];
  const baseHistory = conversationHistory[teacherKey] || [];
  const combined = [...baseHistory, ...priorMessages].slice(-12);

  const messages = [
    { role: 'system', content: teacherProfiles[teacherKey].systemPrompt }
  ];

  combined.forEach((entry) => {
    if (entry && typeof entry.content === 'string') {
      messages.push({ role: entry.role, content: entry.content });
    }
  });

  return messages;
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 120000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function parseJsonResponse(response) {
  const text = await response.text();
  if (!text) {
    throw new Error('The model returned an empty response body.');
  }

  try {
    return JSON.parse(text);
  } catch (error) {
    console.error('Failed to parse response as JSON:', text.substring(0, 200));
    throw new Error(`Invalid JSON response: ${error.message}`);
  }
}

async function callWithOllama(question, teacherKey, history = []) {
  const model = process.env.OLLAMA_MODEL || 'llama3.2:3b';
  const messages = buildHistoryMessages(teacherKey, history);
  messages.push({ role: 'user', content: question });

  const response = await fetchWithTimeout(`${OLLAMA_BASE_URL}/api/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
      stream: false,
      messages
    })
  }, 120000);

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Ollama request failed with status ${response.status}: ${text.substring(0, 100)}`);
  }

  const data = await parseJsonResponse(response);

  const answer = data?.message?.content?.trim();
  if (!answer) {
    throw new Error('The local model returned an empty response.');
  }

  return { answer, fallback: false };
}

async function callOpenAI(question, teacherKey, history = []) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return {
      answer: 'Live LLM is not configured yet. Add OPENAI_API_KEY to .env and restart the server to enable live AI responses.',
      fallback: true
    };
  }

  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
  const messages = buildHistoryMessages(teacherKey, history);
  messages.push({ role: 'user', content: question });

  const response = await fetchWithTimeout(`${OPENAI_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      temperature: 0.7,
      messages
    })
  }, 120000);

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenAI request failed with status ${response.status}: ${text.substring(0, 100)}`);
  }

  const data = await parseJsonResponse(response);

  const answer = data?.choices?.[0]?.message?.content?.trim();
  if (!answer) {
    throw new Error('The model returned an empty response.');
  }

  return { answer, fallback: false };
}

async function callWithVibe(question, teacherKey, history = []) {
  const messages = buildHistoryMessages(teacherKey, history);
  messages.push({ role: 'user', content: question });

  const response = await fetchWithTimeout(VIBE_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${VIBE_API_KEY}`
    },
    body: JSON.stringify({
      model: 'class-chat-model',
      messages
    })
  }, 120000);

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Vibe API request failed with status ${response.status}: ${text.substring(0, 100)}`);
  }

  const data = await parseJsonResponse(response);

  const answer = data?.choices?.[0]?.message?.content?.trim();
  if (!answer) {
    throw new Error('The Vibe API returned an empty response.');
  }

  return { answer, fallback: false };
}

async function callLiveLLM(question, teacherKey, history = []) {
  if (LLM_PROVIDER === 'vibe') {
    return await callWithVibe(question, teacherKey, history);
  }

  if (LLM_PROVIDER === 'ollama') {
    try {
      return await callWithOllama(question, teacherKey, history);
    } catch (error) {
      if (process.env.OPENAI_API_KEY) {
        return await callOpenAI(question, teacherKey, history);
      }
      throw new Error(`Ollama is unavailable: ${error.message}`);
    }
  }

  if (LLM_PROVIDER === 'openai') {
    return await callOpenAI(question, teacherKey, history);
  }

  return await callOpenAI(question, teacherKey, history);
}

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

app.get('/api/teachers', (req, res) => {
  res.json(teacherProfiles);
});

app.post('/api/chat', async (req, res) => {
  try {
    const question = String(req.body?.question || '').trim();
    if (!question) {
      return res.status(400).json({ error: 'Question is required.' });
    }

    const chosenTeacher = req.body?.teacher || routeQuestion(question);
    const incomingHistory = Array.isArray(req.body?.history) ? req.body.history : [];
    const history = [...(conversationHistory[chosenTeacher] || []), ...incomingHistory].slice(-12);

    const result = await callLiveLLM(question, chosenTeacher, history);

    conversationHistory[chosenTeacher] = [
      ...(conversationHistory[chosenTeacher] || []),
      { role: 'user', content: question },
      { role: 'assistant', content: result.answer }
    ].slice(-12);

    res.json({
      teacher: teacherProfiles[chosenTeacher].name,
      teacherKey: chosenTeacher,
      answer: result.answer,
      fallback: result.fallback || false,
      history: conversationHistory[chosenTeacher]
    });
  } catch (error) {
    const errorMessage = error?.message || 'Unknown error';
    res.status(500).json({
      error: 'LLM request failed.',
      message: String(errorMessage).replace(/[\n\r]/g, ' ')
    });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`AI Teacher Orchestrator running on http://localhost:${PORT}`);
  console.log(`LLM provider: ${LLM_PROVIDER}`);
  console.log(`Ollama base URL: ${OLLAMA_BASE_URL}`);
  console.log(`OpenAI key configured: ${Boolean(process.env.OPENAI_API_KEY)}`);
  console.log(`Vibe API URL: ${VIBE_API_URL}`);
  console.log(`Vibe API key configured: ${Boolean(VIBE_API_KEY)}`);
});
