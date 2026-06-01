const models = {
  openai: ['gpt-4o', 'gpt-4-turbo', 'gpt-3.5-turbo'],
  anthropic: ['claude-3-5-sonnet-20241022', 'claude-3-opus-20240229', 'claude-3-haiku-20240307'],
  gemini: ['gemini-1.5-pro-latest', 'gemini-1.5-flash-latest']
};

let currentQuestions = [];
let currentAnswers = [];

document.addEventListener('DOMContentLoaded', () => {
  // Load settings
  chrome.storage.local.get(['apiKey', 'provider', 'model'], (result) => {
    if (result.apiKey) document.getElementById('apiKey').value = result.apiKey;
    if (result.provider) {
      setProvider(result.provider).then(() => {
        if (result.model) {
          // Check if model exists in dropdown
          const modelSelect = document.getElementById('modelSelect');
          if (Array.from(modelSelect.options).some(opt => opt.value === result.model)) {
             modelSelect.value = result.model;
          }
        }
      });
    }
  });

  document.getElementById('detectProviderBtn').addEventListener('click', detectProvider);
  document.getElementById('clearKeyBtn').addEventListener('click', clearKey);
  document.getElementById('providerSelect').addEventListener('change', (e) => setProvider(e.target.value));
  document.getElementById('modelSelect').addEventListener('change', saveSettings);
  document.getElementById('scanBtn').addEventListener('click', scanForm);
  document.getElementById('solveBtn').addEventListener('click', solveWithAI);
  document.getElementById('fillBtn').addEventListener('click', fillForm);
  document.getElementById('randomBtn').addEventListener('click', randomFill);
});

function detectProvider() {
  const key = document.getElementById('apiKey').value.trim();
  let provider = 'unknown';

  if (key.startsWith('sk-ant-')) provider = 'anthropic';
  else if (key.startsWith('sk-')) provider = 'openai';
  else if (key.startsWith('AIza')) provider = 'gemini';

  if (provider === 'unknown') {
    document.getElementById('manualProviderGroup').classList.remove('hidden');
    document.getElementById('providerName').textContent = 'Unknown (Select manually)';
    document.getElementById('providerIcon').textContent = '❓';
  } else {
    document.getElementById('manualProviderGroup').classList.add('hidden');
    setProvider(provider);
  }
}

async function setProvider(provider) {
  const icons = { openai: '🟩', anthropic: '🟪', gemini: '🟦' };
  const names = { openai: 'OpenAI', anthropic: 'Anthropic', gemini: 'Google Gemini' };
  
  document.getElementById('providerName').textContent = names[provider];
  document.getElementById('providerIcon').textContent = icons[provider];
  document.getElementById('providerSelect').value = provider;

  const modelSelect = document.getElementById('modelSelect');
  modelSelect.innerHTML = '<option>Loading...</option>';
  
  let availableModels = models[provider] || [];

  if (provider === 'gemini') {
    const apiKey = document.getElementById('apiKey').value.trim();
    if (apiKey) {
      try {
        const res = await new Promise(r => chrome.runtime.sendMessage({ action: 'getGeminiModels', apiKey }, r));
        if (res && res.models && res.models.length > 0) {
          availableModels = res.models;
        }
      } catch (e) {
        console.error("Error fetching Gemini models", e);
      }
    }
  }

  modelSelect.innerHTML = '';
  availableModels.forEach(model => {
    const option = document.createElement('option');
    option.value = model;
    option.textContent = model;
    modelSelect.appendChild(option);
  });
  
  saveSettings();
}

function clearKey() {
  document.getElementById('apiKey').value = '';
  document.getElementById('providerName').textContent = 'Unknown';
  document.getElementById('providerIcon').textContent = '';
  document.getElementById('manualProviderGroup').classList.add('hidden');
  document.getElementById('modelSelect').innerHTML = '';
  chrome.storage.local.remove(['apiKey', 'provider', 'model']);
  setStatus('apiStatus', 'API Key cleared.', '#34a853');
}

function saveSettings() {
  const apiKey = document.getElementById('apiKey').value.trim();
  let provider = 'unknown';
  
  if (apiKey.startsWith('sk-ant-')) provider = 'anthropic';
  else if (apiKey.startsWith('sk-')) provider = 'openai';
  else if (apiKey.startsWith('AIza')) provider = 'gemini';
  
  if (provider === 'unknown' && !document.getElementById('manualProviderGroup').classList.contains('hidden')) {
    provider = document.getElementById('providerSelect').value;
  } else if (provider === 'unknown') {
    provider = Object.keys(models).find(k => models[k].includes(document.getElementById('modelSelect').value)) || 'openai';
  }

  const model = document.getElementById('modelSelect').value;
  
  chrome.storage.local.set({ apiKey, provider, model }, () => {
    setStatus('apiStatus', 'Settings saved.', '#34a853');
  });
}

function setStatus(elementId, text, color) {
  const el = document.getElementById(elementId);
  el.innerHTML = text;
  el.style.color = color;
  setTimeout(() => el.innerHTML = '', 3000);
}

async function scanForm() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  
  if (!tab.url.includes('docs.google.com/forms')) {
    setStatus('actionStatus', '❌ Not a Google Form page', '#ea4335');
    return;
  }

  chrome.tabs.sendMessage(tab.id, { action: 'scan' }, (response) => {
    if (chrome.runtime.lastError) {
      setStatus('actionStatus', '❌ Please refresh the form page first', '#ea4335');
      return;
    }

    if (response && response.questions) {
      currentQuestions = response.questions;
      renderQuestions(currentQuestions);
      setStatus('actionStatus', `Found ${currentQuestions.length} questions.`, '#34a853');
      
      if (currentQuestions.length > 0) {
        document.getElementById('solveBtn').classList.remove('hidden');
        document.getElementById('fillBtn').classList.add('hidden');
      }
    }
  });
}

function renderQuestions(questions) {
  const area = document.getElementById('resultsArea');
  area.innerHTML = '';
  
  if (questions.length === 0) {
    area.innerHTML = '<i>No questions found.</i>';
  } else {
    questions.forEach(q => {
      const div = document.createElement('div');
      div.className = 'question-item';
      
      // Formatting question text
      let textContent = q.text;
      if (textContent.length > 80) textContent = textContent.substring(0, 80) + '...';
      
      div.innerHTML = `
        <strong>Q${q.id}:</strong> ${textContent}<br>
        <div class="question-type-badge">${q.type.replace('_', ' ').toUpperCase()}</div>
      `;
      area.appendChild(div);
    });
  }
  
  area.classList.remove('hidden');
}

async function solveWithAI() {
  const apiKey = document.getElementById('apiKey').value.trim();
  if (!apiKey) {
    setStatus('apiStatus', '❌ Invalid API Key', '#ea4335');
    return;
  }
  
  saveSettings(); 

  document.getElementById('loading').classList.remove('hidden');
  document.getElementById('solveBtn').disabled = true;
  document.getElementById('scanBtn').disabled = true;

  chrome.runtime.sendMessage({ action: 'solve', questions: currentQuestions }, (response) => {
    document.getElementById('loading').classList.add('hidden');
    document.getElementById('solveBtn').disabled = false;
    document.getElementById('scanBtn').disabled = false;

    if (response && response.error) {
      setStatus('actionStatus', `❌ ${response.error}`, '#ea4335');
      return;
    }

    if (response && response.answers) {
      currentAnswers = response.answers;
      setStatus('actionStatus', `✅ AI answered ${currentAnswers.length}/${currentQuestions.length} questions.`, '#34a853');
      document.getElementById('fillBtn').classList.remove('hidden');
    } else {
      setStatus('actionStatus', `❌ Unexpected response from background script.`, '#ea4335');
    }
  });
}

async function fillForm() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  
  document.getElementById('fillBtn').disabled = true;
  
  chrome.tabs.sendMessage(tab.id, { action: 'fill', answers: currentAnswers }, (response) => {
    document.getElementById('fillBtn').disabled = false;
    
    if (chrome.runtime.lastError) {
      setStatus('actionStatus', '❌ Error communicating with page', '#ea4335');
      return;
    }
    
    if (response && response.success) {
      setStatus('actionStatus', '✅ Form filled successfully!', '#34a853');
    }
  });
}

async function randomFill() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  
  if (!tab?.url?.includes('docs.google.com/forms')) {
    setStatus('actionStatus', '❌ Not a Google Form page', '#ea4335');
    return;
  }
  
  const randomBtn = document.getElementById('randomBtn');
  randomBtn.disabled = true;

  chrome.tabs.sendMessage(tab.id, { action: 'randomFill' }, (response) => {
    randomBtn.disabled = false;
    if (chrome.runtime.lastError) {
      setStatus('actionStatus', '❌ Please refresh the form page first', '#ea4335');
      return;
    }
    
    if (response && response.success) {
      setStatus('actionStatus', '<img src="jackpot.png" style="width:16px;height:16px;vertical-align:middle;margin-right:4px;margin-bottom:2px;"> Đã lụi thành công toàn bộ!', '#d93025');
    }
  });
}
