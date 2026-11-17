/*
 * Cadastros auxiliares — acabamento visual comum.
 * Não muda o que as telas fazem: só enfeita a lista (avatar com iniciais,
 * contador, linha selecionada), mostra no topo do formulário se é um cadastro
 * novo ou uma edição, e salva com Ctrl+S.
 *
 * Marcações usadas nos templates:
 *   .cad-lista table                  a lista (bootstrap-table)
 *   th.cad-nome                       coluna com o nome (ganha o avatar)
 *   [data-cad-contador]               onde vai o total de registros
 *   [data-cad-estado]                 selo "Novo cadastro" / "Editando"
 *   [data-cad-titulo]                 título do cartão do formulário
 *   [data-cad-novo] / [data-cad-salvar]  botões Novo e Salvar
 */
(function ($) {
    'use strict';
    if (!$) { return; }

    var CORES = ['#1ab394', '#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#14b8a6', '#6366f1', '#ef4444', '#0ea5e9', '#84cc16'];

    function iniciais(texto) {
        var p = String(texto || '').replace(/^(dr|dra)\.?\s+/i, '').trim().split(/\s+/).filter(function (x) {
            return x.length > 2 || /^[A-Z]/.test(x);
        });
        if (!p.length) { return '?'; }
        return ((p[0][0] || '') + (p.length > 1 ? p[p.length - 1][0] : (p[0][1] || ''))).toUpperCase();
    }

    function cor(texto) {
        var h = 0, s = String(texto || '');
        for (var i = 0; i < s.length; i++) { h = (h * 31 + s.charCodeAt(i)) >>> 0; }
        return CORES[h % CORES.length];
    }

    function estado(novo, nome) {
        var $e = $('[data-cad-estado]');
        var $t = $('[data-cad-titulo]');
        if (novo) {
            $e.removeClass('cad-estado-editando').text('Novo cadastro');
            $t.text($t.data('cad-titulo') || 'Novo cadastro');
        } else {
            $e.addClass('cad-estado-editando').text('Editando');
            $t.text(nome || $t.data('cad-titulo') || '');
        }
    }

    function decora($tabela) {
        var $linhas = $tabela.find('> tbody > tr').not('.no-records-found');
        var novos = 0;
        $linhas.find('td.cad-nome').each(function () {
            var $td = $(this);
            if ($td.find('.cad-avatar').length) { return; }
            var nome = $.trim($td.text());
            if (!nome || nome === 'None' || nome === '-') { return; }
            $td.wrapInner('<span></span>');
            novos++;
            $td.prepend($('<span class="cad-avatar" aria-hidden="true"></span>').text(iniciais(nome)).css('background', cor(nome)));
        });
        // o avatar alarga a coluna: realinha o cabeçalho fixo da bootstrap-table
        if (novos && !$tabela.data('cad-realinhando')) {
            $tabela.data('cad-realinhando', true);
            try { $tabela.bootstrapTable('resetView'); } catch (e) { /* */ }
            $tabela.data('cad-realinhando', false);
        }
        var total = $linhas.length;
        try { total = $tabela.bootstrapTable('getData').length; } catch (e) { /* lista sem bootstrap-table */ }
        $('[data-cad-contador]').text(total);
    }

    function nomeDaLinha($tr) {
        var $n = $tr.find('td.cad-nome').first();
        if ($n.find('.cad-avatar').length) { $n = $n.find('.cad-avatar').next(); }
        return $.trim(($n.length ? $n : $tr.find('td').filter(function () { return $.trim($(this).text()); }).first()).text());
    }

    $(function () {
        var $tabelas = $('.cad-page .cad-lista table[data-toggle="table"], .cad-page .cad-lista table[id^="tabela"]');
        $tabelas.each(function () {
            var $t = $(this);
            $t.on('post-body.bs.table load-success.bs.table search.bs.table', function () {
                setTimeout(function () { decora($t); }, 0);
            });
            setTimeout(function () { decora($t); }, 300);
        });

        // abrir um registro (duplo clique ou o lápis): marca a linha e o formulário diz "Editando"
        $(document).on('dblclick', '.cad-page .cad-lista tbody > tr', function () {
            var $tr = $(this);
            if ($tr.hasClass('no-records-found')) { return; }
            $tr.addClass('cad-selecionado').siblings().removeClass('cad-selecionado');
            estado(false, nomeDaLinha($tr));
        });
        $(document).on('click', '.cad-page .cad-lista .edit', function () {
            var $tr = $(this).closest('tr');
            $tr.addClass('cad-selecionado').siblings().removeClass('cad-selecionado');
            estado(false, nomeDaLinha($tr));
        });
        $(document).on('click', '[data-cad-novo]', function () {
            $('.cad-page .cad-lista tr.cad-selecionado').removeClass('cad-selecionado');
            // telas cujo "Novo" deixava os dados do registro anterior no formulário
            if ($(this).is('[data-cad-limpa]')) {
                $('.cad-page .cad-form-corpo').find('input[type=text], input:not([type]), textarea').not('#id_id').val('');
            }
            estado(true);
            var $f = $('.cad-page .cad-form-corpo :input:visible:not([type=hidden]):not([readonly])').first();
            setTimeout(function () { $f.trigger('focus'); }, 50);
        });

        // Ctrl+S / Cmd+S: salva
        $(document).on('keydown', function (e) {
            if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
                var $b = $('[data-cad-salvar]').filter(':visible').first();
                if ($b.length) { e.preventDefault(); $b.trigger('click'); }
            }
        });

        estado(true);
    });
}(window.jQuery));
