// A simple letter generator for options (A, B, C...)
function getOptionLabel(index) {
  return String.fromCharCode(65 + index);
}

// Extract questions from Google Forms
function scanQuestions() {
  const questions = [];
  // Select all question blocks
  const questionBlocks = document.querySelectorAll('div[role="listitem"]');

  questionBlocks.forEach((block, index) => {
    const id = index + 1;
    let text = '';
    let type = 'unknown';
    const options = [];

    // Find question text
    const titleEl = block.querySelector('div[role="heading"]');
    if (titleEl) {
      text = titleEl.innerText;
    }

    // Determine type and extract options
    const radioGroup = block.querySelector('div[role="radiogroup"]');
    const checkboxGroup = block.querySelectorAll('div[role="checkbox"]');
    const listbox = block.querySelector('div[role="listbox"]');
    const textInput = block.querySelector('input[type="text"]');
    const textArea = block.querySelector('textarea');

    if (radioGroup) {
      type = 'multiple_choice';
      const radios = block.querySelectorAll('div[role="radio"]');
      radios.forEach((radio, i) => {
        options.push({
          label: getOptionLabel(i),
          text: radio.getAttribute('data-value') || radio.innerText,
          element_ref: i // store index to click later
        });
      });
    } else if (checkboxGroup.length > 0) {
      type = 'checkbox';
      checkboxGroup.forEach((cb, i) => {
        options.push({
          label: getOptionLabel(i),
          text: cb.getAttribute('data-value') || cb.innerText,
          element_ref: i
        });
      });
    } else if (listbox) {
      type = 'dropdown';
      const opts = block.querySelectorAll('div[role="option"]');
      if (opts.length > 1) { // 1st is usually 'Choose'
        opts.forEach((opt, i) => {
          if (i === 0 && opt.innerText.includes('Choose')) return; // skip placeholder
          options.push({
            label: getOptionLabel(options.length), // Recalculate label to ignore placeholder
            text: opt.getAttribute('data-value') || opt.innerText,
            element_ref: i
          });
        });
      }
    } else if (textInput) {
      type = 'short_answer';
    } else if (textArea) {
      type = 'paragraph';
    }

    const lowerText = text.toLowerCase();
    const isPersonalInfo = ['email', 'mssv', 'mã số', 'họ và tên', 'họ tên', 'name', 'lớp', 'class', 'sđt', 'phone'].some(k => lowerText.includes(k));

    if (text && (!isPersonalInfo || (type !== 'short_answer' && type !== 'unknown'))) {
      questions.push({
        id,
        text,
        type,
        options,
        blockIndex: index // to find the block later
      });
    }
  });

  return questions;
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function fillAnswers(answers) {
  const questionBlocks = document.querySelectorAll('div[role="listitem"]');

  for (const answer of answers) {
    const qId = answer.id;
    const ansText = answer.answer; // e.g. "A", "B", or arbitrary text for short answer
    
    // Find corresponding block (0-indexed)
    const block = questionBlocks[qId - 1];
    if (!block) continue;

    const radioGroup = block.querySelector('div[role="radiogroup"]');
    const checkboxGroup = block.querySelectorAll('div[role="checkbox"]');
    const listbox = block.querySelector('div[role="listbox"]');
    const textInput = block.querySelector('input[type="text"]');
    const textArea = block.querySelector('textarea');

    try {
      if (radioGroup) {
        const index = typeof ansText === 'string' ? ansText.charCodeAt(0) - 65 : -1;
        const radios = block.querySelectorAll('div[role="radio"]');
        if (index >= 0 && radios[index]) {
          radios[index].click();
          block.style.border = "2px solid #34a853"; // green border success
          block.style.borderRadius = "8px";
        } else {
          block.style.border = "2px solid #fbbc04"; // yellow warning
          block.style.borderRadius = "8px";
        }
      } else if (checkboxGroup.length > 0) {
        let ansArray = Array.isArray(ansText) ? ansText : [ansText];
        let clickedAny = false;
        ansArray.forEach(a => {
          if (typeof a === 'string') {
            const index = a.charCodeAt(0) - 65;
            if (index >= 0 && checkboxGroup[index]) {
              checkboxGroup[index].click();
              clickedAny = true;
            }
          }
        });
        
        if (clickedAny) {
          block.style.border = "2px solid #34a853";
          block.style.borderRadius = "8px";
        } else {
          block.style.border = "2px solid #fbbc04";
          block.style.borderRadius = "8px";
        }
      } else if (listbox) {
        // Dropdown interactions are tricky since DOM changes. We will click the listbox, wait, and attempt to click option.
        listbox.click();
        await sleep(300); // Wait for options popup to render
        
        // Find options, they are usually appended to body or near the listbox
        const options = document.querySelectorAll('div[role="option"]');
        // Let's assume options are in the DOM somewhere. 
        // We'll search for the right text from the choices or use the index.
        const targetIndex = typeof ansText === 'string' ? ansText.charCodeAt(0) - 65 : -1;
        
        // This is a naive heuristic (assuming the options array matches)
        // Usually, the first option is "Choose".
        const actualOptionIndex = targetIndex + 1;
        
        // Searching for the visible option popup 
        let clicked = false;
        
        // Often, Google Forms renders a separate export of listbox in body
        const popupContainers = document.querySelectorAll('div.exportSelectPopup');
        let activePopup = null;
        popupContainers.forEach(p => {
            if(p.style.display !== 'none') activePopup = p;
        });
        
        if (activePopup) {
            const popupOptions = activePopup.querySelectorAll('div[role="option"]');
            if (actualOptionIndex >= 0 && popupOptions[actualOptionIndex]) {
                popupOptions[actualOptionIndex].click();
                clicked = true;
            }
        }
        
        if (clicked) {
          block.style.border = "2px solid #34a853";
          block.style.borderRadius = "8px";
        } else {
          block.style.border = "2px solid #fbbc04";
          block.style.borderRadius = "8px";
          // Close listbox if we failed to click
          document.body.click(); 
        }
      } else if (textInput) {
        textInput.value = ansText;
        textInput.dispatchEvent(new Event('input', { bubbles: true }));
        block.style.border = "2px solid #34a853";
        block.style.borderRadius = "8px";
      } else if (textArea) {
        textArea.value = ansText;
        textArea.dispatchEvent(new Event('input', { bubbles: true }));
        block.style.border = "2px solid #34a853";
        block.style.borderRadius = "8px";
      }
    } catch (e) {
      console.warn('Failed to fill question', qId, e);
      block.style.border = "2px solid #ea4335"; // red error
      block.style.borderRadius = "8px";
    }

    // Rate limiting
    await sleep(500);
  }

  // Scroll to top optionally
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'scan') {
    const questions = scanQuestions();
    sendResponse({ questions });
  } else if (request.action === 'fill') {
    fillAnswers(request.answers).then(() => {
      sendResponse({ success: true });
    });
    return true; // Keep channel open for async response
  }
});
