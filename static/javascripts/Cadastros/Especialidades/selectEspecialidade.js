class SelectEspecialidade {
    constructor() {
        this.init();
    }

    async init() {
        const $select = $('.select_especialidade');
        this.setSelect($select);
        $select.val(null).trigger('change');
    }

    setSelect(select){
        select.each(function () {
            const $this = $(this);
            $this.select2({
                theme: "bootstrap",
                language: "pt-BR",
                placeholder: "Selecione a especialidade...",
                allowClear: true,
                ajax: {
                    url: '/api/especialidade/',
                    dataType: 'json',
                    delay: 100,
                    data: function (params) {
                        return {
                            search: params.term, // search text
                            limit: 10,
                            offset: (params.page || 0) * 10
                        };
                    },
                    processResults: function (data, params) {
                        params.offset = (params.page || 1) * 10;
                        return {
                            results: data.results,
                            pagination: {
                                more: params.offset < data.count
                            }
                        };
                    },
                    cache: true
                },
                escapeMarkup: function (markup) {
                    return markup;
                }, // let our custom formatter work
                templateResult: formatRepoSelectionEspecialidade, // omitted for brevity, see the source of this page
                templateSelection: formatRepoSelectionEspecialidade, // omitted for brevity, see the source of this page
                dropdownParent: $this.parent()

            });
        });
    }

    removeSelect(select){
        select.each(function () {
            $(this).select2('destroy');
        });
    }
}

const selectEspecialidade = new SelectEspecialidade();
function formatRepoSelectionEspecialidade (repo) {
    return repo.nome || repo.text;
}
