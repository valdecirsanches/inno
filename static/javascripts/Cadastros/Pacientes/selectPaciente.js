
class SelectPaciente {
    constructor() {
        this.init();
    }

    async init() {
        const $select = $('.select_paciente');
        this.setSelect($select);
        $select.trigger('change');
    }

    setSelect(select){
        select.each(function () {
            const $this = $(this);
            $this.select2({
                theme: "bootstrap",
                language: "pt-BR",
                placeholder: "Selecione o paciente...",
                allowClear: true,
                ajax: {
                    url: '/api/paciente/',
                    dataType: 'json',
                    delay: 100,
                    data: function (params) {
                        return {
                            status:'ATIVO',
                            search: params.term, // search text
                            limit: 10,
                            offset: (params.page || 0) * 10
                        };
                    },
                    processResults: function (data, params) {
                        params.offset = (params.page || 1) * 10;
                        let results = data.results;

                        return {
                            results,
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
                templateResult: formatRepoSelectionPaciente, // omitted for brevity, see the source of this page
                templateSelection: formatRepoSelectionPaciente, // omitted for brevity, see the source of this page
                dropdownParent: $this.parent(),
            });
        });
    }

    removeSelect(select){
        select.each(function () {
            $(this).select2('destroy');
        });
    }
}


const selectPaciente = new SelectPaciente();

function formatRepoSelectionPaciente(repo){
    let txt;
    if (repo.paciente) {
        txt = `<span>${repo.paciente} </span>`;
    }
    return txt || repo.text;
}

function changePaciente(pac, fk_pac) {
    var newState;
    if (fk_pac.find("option[value=" + pac.id + "]").length) {
        fk_pac.find("option[value=" + pac.id + "]").remove();
    }
    const parsedPac = {
        ...pac,
        text: pac.paciente
    };

    newState = new Option(formatRepoSelectionPaciente(parsedPac), parsedPac.id, true, true);
    fk_pac.append(newState).trigger('change');
}
