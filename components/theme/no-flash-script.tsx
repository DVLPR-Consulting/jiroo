// Pose la classe de thème et l'attribut de densité sur <html> AVANT l'hydratation,
// pour éviter tout flash. Lu depuis localStorage, sinon préférence système / défaut.
export function NoFlashScript() {
  const code = `(function(){try{
    var t = localStorage.getItem('jiroo-theme');
    if(!t){ t = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'; }
    if(t === 'dark'){ document.documentElement.classList.add('dark'); }
    var d = localStorage.getItem('jiroo-density') || 'comfy';
    document.documentElement.setAttribute('data-density', d);
    var s = localStorage.getItem('jiroo-sidebar-collapsed') === 'true';
    document.documentElement.setAttribute('data-sidebar', s ? 'collapsed' : 'open');
  }catch(e){}})();`;
  return <script dangerouslySetInnerHTML={{ __html: code }} />;
}
