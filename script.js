const teacherProfiles = {
  math: {
    name: 'Math Teacher',
    badge: 'Mathematics',
    intro: 'Ask me anything about numbers, patterns, formulas, or problem-solving, and I’ll explain it in a friendly way.',
    focus: [
      'algebra', 'equation', 'geometry', 'calculus', 'statistics',
      'fraction', 'percentage', 'function', 'solve', 'graph', 'ratio'
    ]
  },
  physics: {
    name: 'Physics Teacher',
    badge: 'Physics',
    intro: 'Let’s explore motion, forces, energy, and the laws behind how the universe behaves.',
    focus: [
      'force', 'motion', 'velocity', 'acceleration', 'energy', 'mass',
      'momentum', 'gravity', 'kinetic', 'potential', 'newton', 'work'
    ]
  },
  science: {
    name: 'Science Teacher',
    badge: 'Science',
    intro: 'I can help with biology, chemistry, experiments, and the scientific method in everyday life.',
    focus: [
      'biology', 'chemistry', 'experiment', 'cell', 'ecosystem', 'atom',
      'reaction', 'lab', 'energy', 'plant', 'human body', 'scientific method'
    ]
  }
};

class TeacherOrchestrator {
  constructor(teachers) {
    this.teachers = teachers;
    this.activeTeacher = 'math';
  }

  setActiveTeacher(key) {
    if (this.teachers[key]) {
      this.activeTeacher = key;
    }
  }

  findKeywordMatch(question, topics) {
    const normalized = question.toLowerCase();
    return topics.some((topic) => normalized.includes(topic));
  }

  routeQuestion(question) {
    const cleanQuestion = question.trim();
    if (!cleanQuestion) {
      return this.activeTeacher;
    }

    const scores = {};

    Object.entries(this.teachers).forEach(([key, teacher]) => {
      const score = teacher.focus.reduce((total, topic) => {
        return total + (this.findKeywordMatch(cleanQuestion, [topic]) ? 1 : 0);
      }, 0);
      scores[key] = score;
    });

    const highestScore = Math.max(...Object.values(scores));
    if (highestScore === 0) {
      return this.activeTeacher;
    }

    const bestMatch = Object.entries(scores).find(([, score]) => score === highestScore);
    return bestMatch ? bestMatch[0] : this.activeTeacher;
  }
}

const orchestrator = new TeacherOrchestrator(teacherProfiles);
const teacherCards = document.querySelectorAll('.teacher-card, .agent-toggle');
const menuOptions = document.querySelectorAll('.menu-option');
const menuButton = document.getElementById('aiMenuButton');
const aiMenu = document.getElementById('aiMenu');
const teacherName = document.getElementById('teacherName');
const teacherBadge = document.getElementById('teacherBadge');
const chatWindow = document.getElementById('chatWindow');
const form = document.getElementById('teacherForm');
const input = document.getElementById('questionInput');

const teacherHistory = {
  math: [],
  physics: [],
  science: []
};

function updateTeacherSelection(key) {
  orchestrator.setActiveTeacher(key);

  teacherCards.forEach((card) => {
    const isSelected = card.dataset.teacher === key;
    card.classList.toggle('selected', isSelected);

    const toggleState = card.querySelector('.toggle-state');
    if (toggleState) {
      toggleState.textContent = isSelected ? 'ON' : 'OFF';
      toggleState.classList.toggle('on', isSelected);
      toggleState.classList.toggle('off', !isSelected);
    }
  });

  menuOptions.forEach((option) => {
    const isSelected = option.dataset.teacher === key;
    option.classList.toggle('selected', isSelected);
  });

  const profile = teacherProfiles[key];
  teacherName.textContent = profile.name;
  teacherBadge.textContent = profile.badge;

  const intro = document.createElement('div');
  intro.className = 'message bot';
  intro.innerHTML = `<strong>${profile.name}:</strong> <span>${profile.intro}</span>`;

  chatWindow.innerHTML = '';
  chatWindow.appendChild(intro);
}

function findKeywordMatch(question, topics) {
  const normalized = question.toLowerCase();
  return topics.some((topic) => normalized.includes(topic));
}

async function getLiveResponse(question, selectedTeacher) {
  const payload = {
    question,
    teacher: selectedTeacher,
    history: teacherHistory[selectedTeacher]
  };

  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  const text = await response.text();
  if (!text) {
    throw new Error(`The AI server returned an empty response (HTTP ${response.status}).`);
  }

  let data;
  try {
    data = JSON.parse(text);
  } catch (error) {
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('text/html')) {
      throw new Error('The chat API returned an HTML page. Start the app with `npm start` and open http://localhost:3000.');
    }
    throw new Error(`The AI server returned invalid JSON (HTTP ${response.status}).`);
  }

  if (!response.ok) {
    throw new Error(data?.message || 'Failed to get a live AI response.');
  }

  if (Array.isArray(data.history)) {
    teacherHistory[selectedTeacher] = data.history;
  }

  return data.answer;
}

teacherCards.forEach((card) => {
  card.addEventListener('click', () => {
    updateTeacherSelection(card.dataset.teacher);
    aiMenu.classList.remove('open');
    menuButton.setAttribute('aria-expanded', 'false');
  });
});

menuOptions.forEach((option) => {
  option.addEventListener('click', () => {
    updateTeacherSelection(option.dataset.teacher);
    aiMenu.classList.remove('open');
    menuButton.setAttribute('aria-expanded', 'false');
  });
});

menuButton.addEventListener('click', () => {
  const isOpen = aiMenu.classList.toggle('open');
  menuButton.setAttribute('aria-expanded', String(isOpen));
});

document.addEventListener('click', (event) => {
  if (!event.target.closest('.menu-wrap')) {
    aiMenu.classList.remove('open');
    menuButton.setAttribute('aria-expanded', 'false');
  }
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const question = input.value.trim();
  if (!question) return;

  const selectedTeacher = orchestrator.routeQuestion(question);
  orchestrator.setActiveTeacher(selectedTeacher);
  updateTeacherSelection(selectedTeacher);

  const userMessage = document.createElement('div');
  userMessage.className = 'message user';
  userMessage.innerHTML = `<strong>You:</strong> <span>${question}</span>`;
  chatWindow.appendChild(userMessage);

  const botMessage = document.createElement('div');
  botMessage.className = 'message bot';
  botMessage.innerHTML = `<strong>${teacherProfiles[selectedTeacher].name}:</strong> <span>Thinking…</span>`;
  chatWindow.appendChild(botMessage);
  chatWindow.scrollTop = chatWindow.scrollHeight;
  input.value = '';
  input.focus();

  try {
    const answer = await getLiveResponse(question, selectedTeacher);
    botMessage.innerHTML = `<strong>${teacherProfiles[selectedTeacher].name}:</strong> <span>${answer}</span>`;
  } catch (error) {
    botMessage.innerHTML = `<strong>${teacherProfiles[selectedTeacher].name}:</strong> <span>Error: ${error.message}</span>`;
  }
});

updateTeacherSelection(orchestrator.activeTeacher);
