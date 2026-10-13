// src/overlay.js
// Reusable text-entry popup (the #name-overlay markup in index.html).
// Native <input> so phone keyboards work. Returns a Promise:
//   resolves with the entered string, or null if the player hits Skip.
// `validate(value)` should return null when OK, or an error message string
// (async allowed - e.g. checking the server for duplicate nicknames).

export function promptText({ title, placeholder = '', initial = '', okLabel = 'OK!', skipLabel = 'Skip', maxLength = 12, validate }) {
    return new Promise((resolve) => {
        const overlay = document.getElementById('name-overlay');
        const input = document.getElementById('name-input');
        const msg = document.getElementById('name-msg');
        const titleEl = document.getElementById('name-title');
        const okBtn = document.getElementById('name-ok');
        const skipBtn = document.getElementById('name-skip');
        if (!overlay) { resolve(null); return; }

        titleEl.textContent = title;
        msg.textContent = '';
        input.value = initial;
        input.placeholder = placeholder;
        input.maxLength = maxLength;
        okBtn.textContent = okLabel;
        skipBtn.textContent = skipLabel;
        overlay.style.display = 'flex';
        setTimeout(() => input.focus(), 50);

        const close = () => {
            overlay.style.display = 'none';
            okBtn.onclick = null;
            skipBtn.onclick = null;
            input.onkeydown = null;
        };
        const submit = async () => {
            const value = input.value.trim();
            okBtn.disabled = true;
            msg.textContent = 'checking...';
            const err = validate ? await validate(value) : null;
            okBtn.disabled = false;
            if (err) { msg.textContent = err; input.select(); return; }
            close();
            resolve(value);
        };
        okBtn.onclick = submit;
        input.onkeydown = (e) => { if (e.key === 'Enter') submit(); };
        skipBtn.onclick = () => { close(); resolve(null); };
    });
}
