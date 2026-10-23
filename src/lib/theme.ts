export const THEME_STORAGE_KEY = "tb-theme";

/** Runs before first paint (inlined in <head>) so there is no light/dark flash. Mirrors applyTheme() in components/ThemeKeeper.tsx, which keeps it applied afterwards. */
export const THEME_INIT_SCRIPT = `(function(){try{var p=localStorage.getItem("${THEME_STORAGE_KEY}")||"system";var d=p==="dark"||(p==="system"&&window.matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d);}catch(e){}})();`;
