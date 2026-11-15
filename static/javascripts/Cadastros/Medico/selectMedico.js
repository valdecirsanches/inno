class SelectMedico {
    constructor() {
        this.init();
    }

    async init() {
        const $select = $('.select_medico');
        this.setSelect($select);
        $select.val(null).trigger('change');
    }

    setSelect(select){
        select.each(function () {
            const $this = $(this);
            $this.select2({
                theme: "bootstrap",
                language: "pt-BR",
                placeholder: "Selecione o médico...",
                allowClear: true,
                ajax: {
                    url: '/api/medico/',
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
                templateResult: formatRepoSelectionMedico, // omitted for brevity, see the source of this page
                templateSelection: formatRepoSelectionMedico, // omitted for brevity, see the source of this page
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

const selectMedico = new SelectMedico();
function formatRepoSelectionMedico (repo) {
    return repo.medico || repo.text;
}

function changeMedico(med, fk_med) {
    var newState;
    if (fk_med.find("option[value=" + med.id + "]").length) {
        fk_med.find("option[value=" + med.id + "]").remove();
    }
    // Create the DOM option that is pre-selected by default
    newState = new Option(med.medico, med.id, true, true);
    // Append it to the select
    fk_med.append(newState).trigger('change');
}

// if ($('#id_fk_medico').find("option[value='" + resp.data.success.fk_medico.id + "']").length) {
//             $('#id_fk_medico').val(resp.data.success.fk_medico.id).trigger('change');
//         } else {
//             // Create a DOM Option and pre-select by default
//             var newOption = new Option(resp.data.success.fk_medico.medico, resp.data.success.fk_medico.id, true, true);
//             // Append it to the select
//             $('#id_fk_medico').append(newOption).trigger('change');
//         }
