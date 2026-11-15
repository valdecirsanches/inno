/**
 * Created by Diego on 05/12/14.
 */
        function limpa_formulário_cep() {
            // Limpa valores do formulário de cep.
            $("#rua_id").val("");
            $("#bairro_id").val("");
            $("#cidade_id").val("");
            $("#uf_id").val("");
            $("#ibge_id").val("");
        }
        //Quando o campo cep perde o foco.
        function ValidarCEP() {
            //Nova variável com valor do campo "cep".
            var cep = $("#cep_id").val();

            //Verifica se campo cep possui valor informado.
            if (cep != "") {

                //Expressão regular para validar o CEP.
                var validacep = /^[0-9]{5}-?[0-9]{3}$/;

                //Valida o formato do CEP.
                if(validacep.test(cep)) {

                    //Preenche os campos com "..." enquanto consulta webservice.
                    $("#rua_id").val("...");
                    $("#bairro_id").val("...");
                    $("#cidade_id").val("...");
                    $("#uf_id").val("...");
                    $("#ibge_id").val("...");

                    //Consulta o webservice http://viacep.com.br/
                    $.getJSON("https://viacep.com.br/ws/"+ cep +"/json/?callback=?", function(dados) {

                        if (!("erro" in dados)) {
                            //Atualiza os campos com os valores da consulta.
                            $("#rua_id").val(dados.logradouro);
                            $("#bairro_id").val(dados.bairro);
                            $("#cidade_id").val(dados.localidade);
                            $("#uf_id").val(dados.uf);
                            $("#ibge_id").val(dados.ibge);
                            $("#numero_id").focus();
                        } //end if.
                        else {
                            //CEP pesquisado não foi encontrado.
                            limpa_formulário_cep();
                            toastr.error('Não encontramos este CEP em nossos registros.','CEP não encontrado!');
                        }
                    });
                } //end if.
                else {
                    //cep é inválido.
                    limpa_formulário_cep();
                    toastr.error('Erro ao preencher o CEP, insira um número válido.','CEP inválido!');
                }
            } //end if.
            else {
                //cep sem valor, limpa formulário.
                limpa_formulário_cep();
            }
        }
