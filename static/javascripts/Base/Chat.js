const chatHost = '://chat.edssolution.com.br';

var chatSocket, contsSocket;
$.ajax({
    url: '/sms/sms.json',
    success: function(data){
        connectConts(data.emp, data.clinica);
    }
});

function connectConts(emp, clinica) {
    contsSocket = new WebSocket(`ws${chatHost}/ws/chat/${emp}/${clinica}/`);
    contsSocket.onmessage = function (e) {
        var data = JSON.parse(e.data);
        var message = data['message'];
        $('#lista_paciente').html('');
        for (var i in message){
            $('#lista_paciente').append(message[i]);
        }
        if(message.length > 0){
            $('#chat_notificaion').html(message.length);
        } else {
            $('#chat_notificaion').html('');
        }
        // console.log(message);
        // console.log(message.length);
        // $('#lista_paciente').html(message)
        // $('#mensagens').append(message);
        //document.querySelector('#chat-log').value += (message + '\n');
    };

    contsSocket.onclose = function (e) {
        setTimeout(function() {
            connectConts(emp, clinica);
        }, 30000);
    };
}

function carregaHistorico(emp, clinica, id_destinatario){
    if(chatSocket && chatSocket.readyState === chatSocket.OPEN){
        chatSocket.close();
        chatSocket='';
    }

    chatSocket = new WebSocket(`ws${chatHost}/ws/chat/${emp}/${clinica}/${id_destinatario}/`);

    chatSocket.onmessage = function(e) {
        var data = JSON.parse(e.data);
        var message = data.message;
        // console.log(message);
        if (typeof message === 'object'){
            $('#chat-destinatario').html(message.destinatario);
            $('#mensagem_paciente').html('');
            for (var i in message.msgs){
                $('#mensagem_paciente').append(message.msgs[i]);
            }
        } else {
            $('#mensagem_paciente').append(message);
        }
        $('#mensagem_paciente').scrollTop($('#mensagem_paciente')[0].scrollHeight);
    };

    chatSocket.onclose = function (e) {
        // setTimeout(function() {
        //   carregaHistorico(emp, clinica, id_destinatario);
        // }, 1000);
    };

    document.querySelector('#chat-message-input').focus();
    document.querySelector('#chat-message-input').onkeyup = function(e) {
        if (e.keyCode === 13) {  // enter, return
            document.querySelector('#chat-message-submit').click();
        }
    };

    document.querySelector('#chat-message-submit').onclick = function(e) {
        var messageInputDom = document.querySelector('#chat-message-input');
        var message = messageInputDom.value;
        chatSocket.send(JSON.stringify({
            'message': message
        }));

        messageInputDom.value = '';
    };
}

function ConfLeitura(msg){
    $.ajax({
        url: `http${chatHost}/chat/confirma_leitura/`,
        data:{id_msg: msg},
        success: function(data){
            toastr('Contato removido da lista de mensagens não lidas', 'Leitura confirmada!')
        }
    });
}