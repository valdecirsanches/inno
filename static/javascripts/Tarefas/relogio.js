/* Relógio do painel: StartClock('d/m/Y', 'H:i:s') atualiza #clock_dt e #clock_tm a cada segundo.
   (substitui o /static/js/clock.js, que não existe no projeto) */
function StartClock(formatoData, formatoHora) {
    function p2(n) { return (n < 10 ? '0' : '') + n; }
    function formata(f, d) {
        var m = { d: p2(d.getDate()), m: p2(d.getMonth() + 1), Y: d.getFullYear(), y: String(d.getFullYear()).slice(2),
                  H: p2(d.getHours()), i: p2(d.getMinutes()), s: p2(d.getSeconds()) };
        return String(f).replace(/[dmYyHis]/g, function (c) { return m[c]; });
    }
    function tique() {
        var agora = new Date();
        var tm = document.getElementById('clock_tm'), dt = document.getElementById('clock_dt');
        if (tm) { tm.innerHTML = formata(formatoHora, agora); }
        if (dt) { dt.innerHTML = formata(formatoData, agora); }
    }
    tique();
    setInterval(tique, 1000);
}
