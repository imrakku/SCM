// js/themeSwitcher.js

const themeToggleBtn = document.getElementById('themeToggleBtn');
const themeIconSun = document.getElementById('themeIconSun');
const themeIconMoon = document.getElementById('themeIconMoon');
const userPrefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
const currentTheme = localStorage.getItem('theme');

/**
 * Applies the selected theme to the body and updates the toggle icon.
 * @param {string} theme - The theme to apply ('dark' or 'light').
 */
function applyTheme(theme) {
    if (theme === 'dark') {
        document.body.classList.add('dark-mode');
        themeIconSun?.classList.add('hidden');
        themeIconMoon?.classList.remove('hidden');
    } else {
        document.body.classList.remove('dark-mode');
        themeIconSun?.classList.remove('hidden');
        themeIconMoon?.classList.add('hidden');
    }
}

/**
 * Initializes the theme based on localStorage or system preference.
 */
export function initializeThemeSwitcher() {
    if (currentTheme === 'dark') {
        applyTheme('dark');
    } else if (currentTheme === 'light') {
        applyTheme('light');
    } else if (userPrefersDark) { // If no preference in localStorage, check system preference
        applyTheme('dark');
        // Optionally, save this initial detection to localStorage
        // localStorage.setItem('theme', 'dark'); 
    } else {
        applyTheme('light'); // Default to light if no preference and system is not dark
    }

    if (themeToggleBtn) {
        themeToggleBtn.addEventListener('click', () => {
            let newTheme;
            if (document.body.classList.contains('dark-mode')) {
                newTheme = 'light';
            } else {
                newTheme = 'dark';
            }
            applyTheme(newTheme);
            localStorage.setItem('theme', newTheme);
            console.log(`Theme switched to: ${newTheme}`);

            // Dispatch a custom event that charts can listen to
            window.dispatchEvent(new CustomEvent('themeChanged', { detail: { theme: newTheme } }));
        });
    } else {
        console.warn("Theme toggle button not found.");
    }
}
