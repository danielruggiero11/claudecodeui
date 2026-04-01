console.log("Claude Pacer: Script Loaded");

function injectPace() {
    const progressBar = document.querySelector('div[role="progressbar"]');
    
    if (!progressBar) {
        // This is normal if the page is still loading
        return; 
    }

    if (document.getElementById('pace-indicator')) {
        return; // Already injected
    }

    console.log("Claude Pacer: Progress bar found. Attempting injection...");

    // 1. Get raw values
    // Matches "$975.74 of $1,000.00 spent"
    const bodyText = document.body.innerText;
    const regex = /\$([\d,.]+)\s+of\s+\$([\d,.]+)\s+spent/i;
    const match = bodyText.match(regex);

    if (!match) {
        console.log("Claude Pacer: Could not find spend text in body.");
        return;
    }

    const spent = parseFloat(match[1].replace(/,/g, ''));
    const total = parseFloat(match[2].replace(/,/g, ''));
    console.log(`Claude Pacer: Data parsed - Spent: ${spent}, Total: ${total}`);

    // 2. Calculate Pace
    const now = new Date();
    const day = now.getDate();
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const pacePercent = (day / lastDay) * 100;
    
    const expectedSpend = total * (day / lastDay);
    const diff = (spent - expectedSpend).toFixed(2);
    const isAhead = spent < expectedSpend;

    // 3. Inject Tick
    progressBar.style.position = 'relative';
    progressBar.style.overflow = 'visible';
    
    const tick = document.createElement('div');
    tick.id = 'pace-indicator';
    tick.style.cssText = `
        position: absolute;
        left: ${pacePercent}%;
        top: -4px;
        height: calc(100% + 8px);
        width: 2px;
        background: #000;
        z-index: 9999;
        pointer-events: none;
    `;
    
    const label = document.createElement('span');
    label.innerText = '↑ pace';
    label.style.cssText = 'position:absolute; bottom:-18px; left:-12px; font-size:10px; color:#666; white-space:nowrap;';
    
    tick.appendChild(label);
    progressBar.appendChild(tick);

    // 4. Inject Text
    const infoContainer = progressBar.parentElement;
    const paceLine = document.createElement('p');
    paceLine.id = 'pace-text';
    paceLine.style.cssText = `
        font-size: 0.875rem;
        font-weight: 600;
        margin-top: 12px;
        color: ${isAhead ? '#16a34a' : '#dc2626'};
    `;
    paceLine.innerHTML = `${isAhead ? '▲' : '▼'} $${Math.abs(diff)} ${isAhead ? 'ahead of' : 'behind'} pace`;
    infoContainer.appendChild(paceLine);
    
    console.log("Claude Pacer: Injection successful.");
}

// Check every 1 second to catch the SPA navigation
setInterval(injectPace, 1000);