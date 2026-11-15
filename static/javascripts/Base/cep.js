/**
 * Created by Diego on 05/12/14.
 */
function limpa_formulário_cep(
    id_rua,
    id_bairro,
    id_cidade,
    id_uf,
    id_ibge
    ) {
    // Limpa valores do formulário de cep.
    $('#'+id_rua).val("");
    $('#'+id_bairro).val("");
    $('#'+id_cidade).val("");
    $('#'+id_uf).val("");
    $('#'+id_ibge).val("");
}
//Quando o campo cep perde o foco.
function BuscaCep(
    id_cep,
    id_rua,
    id_numero,
    id_bairro,
    id_cidade,
    id_uf,
    id_ibge
    ) {

    id_cep = typeof id_cep !== 'undefined' ? id_cep : 'id_cep';
    id_rua = typeof id_rua !== 'undefined' ? id_rua : 'id_rua';
    id_numero = typeof id_numero !== 'undefined' ? id_numero : 'id_numero';
    id_bairro = typeof id_bairro !== 'undefined' ? id_bairro : 'id_bairro';
    id_cidade = typeof id_cidade !== 'undefined' ? id_cidade : 'id_cidade';
    id_uf = typeof id_uf !== 'undefined' ? id_uf : 'id_uf';
    id_ibge = typeof id_ibge !== 'undefined' ? id_ibge : 'id_ibge';

    //Nova variável com valor do campo "cep".
    var cep = $("#"+id_cep).val();

    //Verifica se campo cep possui valor informado.
    if (cep != "") {

        //Expressão regular para validar o CEP.
        var validacep = /^[0-9]{5}-?[0-9]{3}$/;

        //Valida o formato do CEP.
        if(validacep.test(cep)) {

            //Preenche os campos com "..." enquanto consulta webservice.
            $('#'+id_rua).val("...");
            $('#'+id_bairro).val("...");
            $('#'+id_cidade).val("...");
            $('#'+id_uf).val("...");
            $('#'+id_ibge).val("...");

            //Consulta o webservice http://viacep.com.br/
            $.getJSON("https://viacep.com.br/ws/"+ cep +"/json/?callback=?", function(dados) {

                if (!("erro" in dados)) {
                    //Atualiza os campos com os valores da consulta.
                    $('#'+id_rua).val(dados.logradouro);
                    $('#'+id_bairro).val(dados.bairro);
                    $('#'+id_cidade).val(dados.localidade);
                    $('#'+id_uf).val(dados.uf);
                    $('#'+id_ibge).val(dados.ibge);
                    $('#'+id_numero).focus();
                } //end if.
                else {
                    //CEP pesquisado não foi encontrado.
                    limpa_formulário_cep(
                        id_rua,
                        id_cidade,
                        id_uf,
                        id_ibge
                    );
                    alert("CEP não encontrado.");
                }
            });
        } //end if.
        else {
            //cep é inválido.
            limpa_formulário_cep(
                id_rua,
                id_bairro,
                id_cidade,
                id_uf,
                id_ibge
            );
            alert("Formato de CEP inválido.");
        }
    } //end if.
    else {
        //cep sem valor, limpa formulário.
        limpa_formulário_cep(
            id_rua,
            id_bairro,
            id_cidade,
            id_uf,
            id_ibge
        );
    }
}
