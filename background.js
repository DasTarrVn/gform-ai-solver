chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'solve') {
    handleSolveRequest(request.questions).then(sendResponse);
    return true; // Keep message channel open for async response
  } else if (request.action === 'getGeminiModels') {
    fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${request.apiKey}`)
      .then(res => res.json())
      .then(data => {
         if (data.error) {
            sendResponse({error: data.error.message});
            return;
         }
         const models = data.models
           .filter(m => m.supportedGenerationMethods && m.supportedGenerationMethods.includes('generateContent'))
           .map(m => m.name.replace('models/', ''));
         sendResponse({models});
      })
      .catch(e => sendResponse({error: e.message}));
    return true;
  }
});

async function handleSolveRequest(questions) {
  try {
    const { apiKey, provider, model } = await chrome.storage.local.get(['apiKey', 'provider', 'model']);
    if (!apiKey) return { error: "API Key is missing." };

    const prompt = buildPrompt(questions);

    let resultJson = '';

    if (provider === 'openai') {
      resultJson = await callOpenAI(apiKey, model, prompt);
    } else if (provider === 'anthropic') {
      resultJson = await callAnthropic(apiKey, model, prompt);
    } else if (provider === 'gemini') {
      resultJson = await callGemini(apiKey, model, prompt);
    } else {
      return { error: "Unsupported provider." };
    }

    const answers = parseAIResponse(resultJson);
    return { answers };

  } catch (error) {
    console.error("AI API Error:", error);
    return { error: error.message };
  }
}

function buildPrompt(questions) {
  let prompt = `You are a helpful assistant solving a multiple-choice quiz.
For each question below, select the best answer from the given options.
Respond ONLY with a JSON array, no explanation, no markdown.
Format: [{"id": 1, "answer": "A"}, {"id": 2, "answer": "C"}, ...]
Questions:\n\n`;

  questions.forEach(q => {
    prompt += `ID: ${q.id}\nQuestion: ${q.text}\nType: ${q.type}\n`;
    if (q.options && q.options.length > 0) {
      prompt += `Options:\n`;
      q.options.forEach(opt => {
        prompt += `${opt.label}: ${opt.text}\n`;
      });
    }
    prompt += `\n`;
  });

  return prompt;
}

async function callOpenAI(apiKey, model, prompt) {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: model || "gpt-3.5-turbo",
      messages: [{ role: "user", content: prompt }]
    })
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || `OpenAI Error: ${response.statusText}`);
  }
  
  const data = await response.json();
  return data.choices[0].message.content;
}

async function callAnthropic(apiKey, model, prompt) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerously-allow-browser": "true" 
    },
    body: JSON.stringify({
      model: model || "claude-3-haiku-20240307",
      max_tokens: 2048,
      messages: [{ role: "user", content: prompt }]
    })
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || `Anthropic Error: ${response.statusText}`);
  }

  const data = await response.json();
  return data.content[0].text;
}

async function callGemini(apiKey, model, prompt) {
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model || 'gemini-1.5-flash-latest'}:generateContent?key=${apiKey}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }]
    })
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || `Gemini Error: ${response.statusText}`);
  }

  const data = await response.json();
  return data.candidates[0].content.parts[0].text;
}

function parseAIResponse(text) {
  // Strip markdown formatting if AI included it by mistake
  const cleanText = text.replace(/```json/g, '').replace(/```/g, '').trim();
  try {
    return JSON.parse(cleanText);
  } catch (e) {
    console.error("Failed to parse AI response:", cleanText);
    throw new Error("Failed to parse AI response as JSON. AI returned: " + text.substring(0, 100) + "...");
  }
}
