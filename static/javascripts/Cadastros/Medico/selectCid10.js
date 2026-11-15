class SelectCID10 {
    constructor() {
        this.init();
    }

    async init() {
        const $select = $('.select_CID10');
        this.setSelect($select);
        $select.val(null).trigger('change');
    }

    setSelect(select){
        select.each(function () {
            const $this = $(this);
            $this.select2({
                theme: "bootstrap",
                language: "pt-BR",
                placeholder: "Selecione o CID10...",
                allowClear: true,
                ajax: {
                    url: '/api/medico/cid10/',
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
                templateResult: formatRepoSelectionCID10, // omitted for brevity, see the source of this page
                templateSelection: formatRepoSelectionCID10, // omitted for brevity, see the source of this page
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

const selectCID10 = new SelectCID10();
function formatRepoSelectionCID10 (repo) {
    if (repo.codigo) {
        return repo.codigo+' | '+repo.descricao;
    } else {
        return repo.text;
    }
}

async function changeCID10(cid10, id_cid10) {
    // Create the DOM option that is pre-selected by default
    let resp = await api.get('medico/get-cid10/?cids='+cid10);
    for(i in resp.data) {
        if (id_cid10.find(`option[value="${resp.data[i].id}"]`).length) {
            id_cid10.find(`option[value="${resp.data[i].id}"]`).remove();
        }
        var newOption = new Option(resp.data[i].title, resp.data[i].id, true, true);
        id_cid10.append(newOption);
    }
    id_cid10.trigger('change');
}