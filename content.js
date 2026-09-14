// ============================================================
// AUTO FILL BOT v3.0 - Rule-Based Universal Form Filler
// Kiến trúc: Quét MÀN HÌNH → Khớp LABEL → Điền theo KIỂU DỮ LIỆU
// ============================================================

function delay(ms) { return new Promise(function(r) { setTimeout(r, ms); }); }

// ===== FILL ELEMENT =====
function fillElement(el, value) {
  var nameId = ((el.name || '') + ' ' + (el.id || '')).toLowerCase();
  var finalValue = value;

  // Smart Date Splitter
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    var parts = value.split('-');
    if (nameId.includes('-month')) finalValue = parts[1];
    else if (nameId.includes('-year')) finalValue = parts[0];
    else if (nameId.includes('-day')) finalValue = parts[2];
    else if (el.type === 'date') finalValue = value;
  }

  if (el.type === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(String(finalValue))) return false;

  var changed = false;
  if (el.tagName === 'SELECT') {
    var opt = Array.from(el.options).find(function(o) {
      return o.value === String(finalValue) || o.text.trim() === String(finalValue);
    });
    if (opt) { el.value = opt.value; changed = true; }
  } else if (el.type === 'checkbox' || el.type === 'radio') {
    if (String(el.value) === String(finalValue) || finalValue === true) {
      if (!el.checked) {
          el.click();
          if (!el.checked && el.parentElement && el.parentElement.tagName === 'LABEL') {
              el.parentElement.click();
          }
      }
      changed = true;
    }
  } else {
    var nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    var nativeTextAreaSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
    var setter = el.tagName === 'TEXTAREA' ? nativeTextAreaSetter : nativeInputValueSetter;
    
    if (setter) setter.call(el, finalValue);
    else el.value = finalValue;
    
    changed = true;
  }

  if (changed) {
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.style.border = '2px solid #4CAF50';
    el.style.backgroundColor = '#e8f5e9';
  }
  return changed;
}

// ===== GET FIELD LABEL =====
function getFieldLabel(el) {
  var parts = [];
  if (el.name) parts.push(el.name);
  if (el.id) parts.push(el.id);
  if (el.placeholder) parts.push(el.placeholder);

  var node = el;
  for (var level = 0; level < 4 && node; level++) {
    var parent = node.parentElement;
    if (!parent || parent.tagName === 'BODY') break;

    for (var i = 0; i < parent.childNodes.length; i++) {
      var child = parent.childNodes[i];
      if (child === node || (child.contains && child.contains(node))) break;
      if (child.nodeType === 3) {
        var t = child.textContent.trim();
        if (t) parts.push(t);
      } else if (child.nodeType === 1) {
        if (!child.querySelector || !child.querySelector('input, select, textarea, .input-field-select')) {
          var t = (child.textContent || '').trim();
          if (t && t.length < 200) parts.push(t);
        }
      }
    }
    
    var ps = parent.previousElementSibling;
    if (ps && (!ps.querySelector || !ps.querySelector('input, select, textarea, .input-field-select'))) {
      var t = (ps.textContent || '').trim();
      if (t && t.length < 200) parts.push(t);
    }
    node = parent;
  }
  
  var text = parts.join(' ').toLowerCase();
  
  if (text.length < 3 || text.includes('-- chọn --')) {
      try {
          var p = el.parentElement;
          var attempts = 0;
          while (p && attempts < 5) {
              if (p.classList && (p.classList.contains('row') || p.classList.contains('MuiGrid-root'))) {
                  var pText = p.textContent.replace(/\s+/g, ' ').trim();
                  if (pText.length > 3 && pText.length < 500) return pText.toLowerCase();
              }
              p = p.parentElement;
              attempts++;
          }
      } catch(e) {}
  }
  return text;
}

// ===== FILL DROPDOWN (Custom React/MUI Select) =====
async function fillDropdown(trigger, dataValue, textValue) {
  trigger.scrollIntoView({ block: 'center' });
  trigger.click();
  await delay(700);

  var all = Array.from(document.querySelectorAll('li, span, div, p, option'));
  var opt = all.reverse().find(function(el) {
    if (el.offsetHeight === 0) return false;
    if (dataValue) {
      var dv = String(dataValue);
      if (el.getAttribute('data-value') === dv || el.getAttribute('value') === dv || el.getAttribute('data-id') === dv) return true;
    }
    if (textValue) {
      var tv = textValue.trim().toLowerCase();
      var tContent = el.textContent.trim().toLowerCase();
      if (tContent.includes(tv) && el.children.length === 0) return true;
    }
    return false;
  });

  if (opt) { opt.click(); await delay(400); return true; }
  else { document.body.click(); await delay(200); return false; }
}

// ===== FLATTEN DATA + ALIAS =====
function flattenDataAndAlias(data, aliases, prefix) {
  prefix = prefix || '';
  var result = [];
  if (data === null || data === undefined) return result;
  if (Array.isArray(data)) {
    data.forEach(function(item, i) {
      result = result.concat(flattenDataAndAlias(item, aliases, prefix + '[' + i + '].'));
    });
  } else if (typeof data === 'object') {
    Object.keys(data).forEach(function(key) {
      result = result.concat(flattenDataAndAlias(data[key], aliases, prefix ? prefix + key : key));
    });
  } else {
    var names = [prefix];
    var m = prefix.match(/([^.\[\]]+)$/);
    var rootKey = m ? m[1] : prefix;
    if (rootKey !== prefix) names.push(rootKey);
    var al = aliases[prefix] || aliases[rootKey];
    if (al) al.forEach(function(a) { if (names.indexOf(a) === -1) names.push(a); });
    result.push({ names: names, value: data, isDropdown: prefix.includes('QuocTich') || prefix.includes('DanToc') }); // Tạm hardcode isDropdown
  }
  return result;
}

// ============================================================
// MAIN LISTENER & LOGIC
// ============================================================
async function runAutoFill(config) {
  var totalFilled = 0;
  var done = new Set();
  var passes = 3;

  for (var p = 0; p < passes; p++) {
      var filledInPass = 0;

      // STEP 1: PRE-ACTIONS (Chỉ chạy vòng 1)
      if (p === 0 && config.preActions) {
        config.preActions.forEach(function(act) {
          if (act.type === 'click') {
            try {
              var els = document.querySelectorAll(act.selector);
              els.forEach(function(el) { el.click(); });
            } catch(e){console.error(e);}
          }
        });
        await delay(500);
      }

      // STEP 2: EXACT DATA MATCHING
      if (config.data) {
        var flatData = flattenDataAndAlias(config.data, config.aliases || {}, '');
        for (var di = 0; di < flatData.length; di++) {
          var item = flatData[di];
          var cssNames = item.names.filter(function(n) { return /^[a-zA-Z0-9_\-\[\].]+$/.test(n) && n.length >= 4; });
          if (cssNames.length === 0) continue;
          var selParts = [];
          cssNames.forEach(function(n) {
            selParts.push('input[name*="' + n + '" i]');
            selParts.push('input[id*="' + n + '" i]');
            selParts.push('select[name*="' + n + '" i]');
            selParts.push('select[id*="' + n + '" i]');
            selParts.push('textarea[name*="' + n + '" i]');
            selParts.push('textarea[id*="' + n + '" i]');
          });
          try {
            var els = Array.from(document.querySelectorAll(selParts.join(', '))).filter(function(e) { return e.type !== 'hidden' && !done.has(e); });
            for (var ei = 0; ei < els.length; ei++) {
              if (fillElement(els[ei], item.value)) { filledInPass++; done.add(els[ei]); }
            }
          } catch (e) {console.error(e);}
        }
      }

      // STEP 3: RULES ENGINE
      var rules = config.rules || {};
      
      if (rules.input) {
        var textInputs = Array.from(document.querySelectorAll('input[type=text], input[type=email], input[type=tel], input[type=number], input:not([type]), textarea')).filter(function(e) { return e.offsetHeight > 0 && e.type !== 'hidden' && !done.has(e); });
        var inputKeys = Object.keys(rules.input);
        for (var ik = 0; ik < inputKeys.length; ik++) {
          var kwStr = inputKeys[ik];
          var value = rules.input[kwStr];
          var kws = kwStr.split(',').map(function(k) { return k.trim().toLowerCase(); }).filter(Boolean);
          for (var ti = 0; ti < textInputs.length; ti++) {
            var txtEl = textInputs[ti];
            if (done.has(txtEl)) continue;
            var label = getFieldLabel(txtEl).toLowerCase();
            if (kws.some(function(kw) { return label.includes(kw) || (txtEl.name || '').toLowerCase().includes(kw); })) {
                if (fillElement(txtEl, value)) { filledInPass++; done.add(txtEl); }
            }
          }
        }
      }

      if (rules.date) {
        var dateInputs = Array.from(document.querySelectorAll('input[type=date], .input-field-dot')).filter(function(e) { return e.offsetHeight > 0 && e.type !== 'hidden' && !done.has(e); });
        var dateKeys = Object.keys(rules.date);
        for (var dk = 0; dk < dateKeys.length; dk++) {
          var kwStr = dateKeys[dk];
          var value = rules.date[kwStr];
          var kws = kwStr.split(',').map(function(k) { return k.trim().toLowerCase(); }).filter(Boolean);
          for (var ti = 0; ti < dateInputs.length; ti++) {
            var dtEl = dateInputs[ti];
            if (done.has(dtEl)) continue;
            var label = getFieldLabel(dtEl).toLowerCase();
            if (kws.some(function(kw) { return label.includes(kw) || (dtEl.name || '').toLowerCase().includes(kw); })) {
                if (fillElement(dtEl, value)) { filledInPass++; done.add(dtEl); }
            }
          }
        }
      }

      if (rules.checkbox) {
        function getOptionLabel(el) {
            if (el.parentElement && el.parentElement.tagName === 'LABEL') return el.parentElement.textContent.replace(/\s+/g, ' ').trim().toLowerCase();
            var sib = el.nextSibling;
            while (sib) {
                if (sib.nodeType === 3) { var t = sib.textContent.trim(); if (t) return t.toLowerCase(); }
                else if (sib.nodeType === 1) { var t2 = sib.textContent.trim(); if (t2) return t2.toLowerCase(); }
                sib = sib.nextSibling;
            }
            return '';
        }
        var checks = Array.from(document.querySelectorAll('input[type=checkbox], input[type=radio]')).filter(function(e) { return e.offsetHeight > 0; });
        var cbKeys = Object.keys(rules.checkbox);
        for (var ck = 0; ck < cbKeys.length; ck++) {
          var kwStr = cbKeys[ck];
          var valueToMatch = rules.checkbox[kwStr];
          var kws = kwStr.split(',').map(function(k) { return k.trim().toLowerCase(); }).filter(Boolean);
          for (var ci = 0; ci < checks.length; ci++) {
            var chk = checks[ci];
            if (done.has(chk)) continue;
            var groupLabel = getFieldLabel(chk).toLowerCase();
            var optionLabel = getOptionLabel(chk);
            var val = (chk.value || '').toLowerCase();
            if (kws.some(function(kw) { return groupLabel.includes(kw) || (chk.name || '').toLowerCase().includes(kw); })) {
                var vMatch = String(valueToMatch).toLowerCase();
                if (valueToMatch === true || optionLabel.includes(vMatch) || val === vMatch) {
                    if (fillElement(chk, true)) { filledInPass++; done.add(chk); }
                }
            }
          }
        }
      }

      if (rules.dropdown) {
        var ddKeys = Object.keys(rules.dropdown);
        for (var ddk = 0; ddk < ddKeys.length; ddk++) {
            var kwStr = ddKeys[ddk];
            var valueToMatch = rules.dropdown[kwStr];
            var ddKws = kwStr.split(',').map(function(k) { return k.trim().toLowerCase(); }).filter(Boolean);
            
            var dropdowns = document.querySelectorAll('.input-field-select');
            for (var di = 0; di < dropdowns.length; di++) {
                var el = dropdowns[di];
                if (done.has(el)) continue;
                var label = getFieldLabel(el).toLowerCase();
                if (ddKws.some(function(kw) { return label.includes(kw); })) {
                    var success = await fillDropdown(el, null, String(valueToMatch));
                    if (success) { filledInPass++; done.add(el); }
                }
            }
        }
      }
      
      totalFilled += filledInPass;
      console.log('[BROWSER] Auto Fill Pass ' + (p+1) + ': ' + filledInPass + ' fields filled.');
      if (filledInPass > 0) {
          await delay(1500); // Đợi API load dropdown mới (nếu có)
      } else {
          break; // Không điền thêm được gì thì thoát sớm
      }
  }

  console.log('[BROWSER] Auto Fill v3.0: Done - ' + totalFilled + ' fields filled.');
  if (document.getElementById('__bs_notify__')) {
      var ev = new CustomEvent('__bs_notify__', { detail: { msg: 'Đã điền tự động: ' + totalFilled + ' trường!', type: 'success' }});
      window.dispatchEvent(ev);
  }
  return totalFilled;
}

chrome.runtime.onMessage.addListener(function(req, sender, sendResponse) {
  if (req.action === 'fillForm') {
    runAutoFill(req.config || {}).then(filled => {
      sendResponse({ status: 'Success', filled: filled });
    });
    return true;
  }
});

// TEST HOOK: Lắng nghe event từ DOM để Playwright có thể trigger auto-fill mà không cần fetch
window.addEventListener('__TEST_AUTOFILL_WITH_CONFIG__', async function(e) {
  console.log('[BROWSER] [TEST] Triggering autofill with injected config');
  const config = e.detail;
  const filledCount = await runAutoFill(config);
  window.dispatchEvent(new CustomEvent('__AUTOFILL_DONE__', { detail: filledCount }));
});
