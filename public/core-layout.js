// Fixed geometry for every view: the face keeps one place and size at the top,
// the chat bar is docked at the bottom, and only the middle area changes.
const $ = s => document.querySelector(s);
$('.topbar').after($('.tabs'));
const tools = document.createElement('div'); tools.className = 'composer-tools';
tools.append($('#attach'), $('#workMode'), $('#webToggle'), $('#imageToggle'), $('#wakeChip'), $('#speakToggle'));
$('.composer-row').prepend(tools);
const actions = document.createElement('div'); actions.className = 'composer-actions';
actions.append($('#enableAudio'), $('#micInline'), $('#stopResponse'), $('#send')); $('.composer-row').append(actions);
// The dock lives outside the panels, so switching views never moves it.
const dock = document.createElement('div'); dock.className = 'dock'; dock.id = 'dock';
dock.append($('#chatForm'), $('.composer-hint'));
$('.shell').append(dock);
// Core view gets its own calm home in the middle area: greeting, live caption, ideas.
const home = document.createElement('section'); home.className = 'panel core-panel'; home.id = 'corePanel'; home.setAttribute('aria-label', 'Home');
const ideas = $('.welcome .suggestions').cloneNode(true); ideas.classList.add('core-ideas');
home.append($('#coreGreeting'), $('#caption'), $('.core-connect'), ideas);
$('#main').prepend(home);
// A side panel on the right for a live game, so the chat stays in the centre.
const side = document.createElement('aside'); side.className = 'side-board'; side.id = 'sideBoard'; side.hidden = true; side.setAttribute('aria-label', 'Chess game');
$('.shell').append(side);
function phase() { const activity = document.body.dataset.activity || 'idle'; $('#systemState').textContent = 'SYS // ' + (activity === 'idle' && document.body.dataset.wake === 'armed' ? 'WAKE READY' : activity.toUpperCase()); }
new MutationObserver(phase).observe(document.body, {attributes: true, attributeFilter: ['data-activity', 'data-wake']}); phase();
