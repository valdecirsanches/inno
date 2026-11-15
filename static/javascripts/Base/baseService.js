
axios.defaults.xsrfHeaderName = "X-CSRFTOKEN";
axios.defaults.xsrfCookieName = "csrftoken";
const api = axios.create({
    baseURL: '/api',
});


function getCookie(name) {
    let cookieValue = null;
    if (document.cookie && document.cookie != '') {
        let cookies = document.cookie.split(';');
        for (let i = 0; i < cookies.length; i++) {
            let cookie = jQuery.trim(cookies[i]);
            // Does this cookie string begin with the name we want?
            if (cookie.substring(0, name.length + 1) == (name + '=')) {
                cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
                break;
            }
        }
    }
    return cookieValue;
}

let csrftoken = getCookie('csrftoken');

function csrfSafeMethod(method) {
    // these HTTP methods do not require CSRF protection
    return (/^(GET|HEAD|OPTIONS|TRACE)$/.test(method));
}

$.ajaxSetup({
    beforeSend: function(xhr, settings) {
        if (!csrfSafeMethod(settings.type) && !this.crossDomain) {
            xhr.setRequestHeader("X-CSRFToken", csrftoken);
        }
    }
});

const myRequest = (path, params, method='post', notSubmit=false, target='_blank') => {
    const form = document.createElement("form");
    form.setAttribute("method", method);
    form.setAttribute("action", path);

    if (!csrfSafeMethod(method)){
        const csrftoken = getCookie('csrftoken');
        const hiddenField = document.createElement("input");
        hiddenField.setAttribute("type", "hidden");
        hiddenField.setAttribute("name", 'csrfmiddlewaretoken');
        hiddenField.setAttribute("value", csrftoken);
        form.appendChild(hiddenField);
    }

    for(const key in params) {
        if(params.hasOwnProperty(key)) {
            const hiddenField = document.createElement("input");
            hiddenField.setAttribute("type", "hidden");
            hiddenField.setAttribute("name", key);
            hiddenField.setAttribute("value", params[key]);

            form.appendChild(hiddenField);
         }
    }

    document.body.appendChild(form);
    if (notSubmit) {
        return $(form).serializeObject();
    }
    form.setAttribute("target", target);
    form.submit();
};

const post = myRequest;


function getUrlParameter(sParam) {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get(sParam);
}


// Sessão expirada: o servidor responde 401 e a tela volta para o login,
// em vez de mostrar "erro inesperado" e não salvar nada.
function irParaLogin() {
    if (window.__indoParaLogin) { return; }
    window.__indoParaLogin = true;
    window.location.href = '/login/?next=' + encodeURIComponent(window.location.pathname + window.location.search);
}
$(document).ajaxError(function (evento, xhr) {
    if (xhr && xhr.status === 401) { irParaLogin(); }
});
api.interceptors.response.use(null, function (erro) {
    if (erro && erro.response && erro.response.status === 401) { irParaLogin(); }
    return Promise.reject(erro);
});
