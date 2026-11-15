const
	rCRLF = /\r?\n/g,
	rsubmitterTypes = /^(?:submit|button|image|reset|file)$/i,
	rsubmittable = /^(?:input|select|textarea|keygen|checkbox|fieldset)/i,
    rradioType = ( /^(?:radio)$/i ),
    rjsonlistType = ( /^(?:jsonlist)$/i ),
    rcheckableType = ( /^(?:checkbox)$/i );

$('form').submit(function () {
    return false;
});

$.fn.serializeArray = function() {
    return this.map( function() {
        // Can add propHook for "elements" to filter or add form elements
        var elements = jQuery.prop( this, "elements" );
        return elements ? jQuery.makeArray( elements ) : this;
    } )
    .filter( function() {
        var type = this.type;

        // Use .is( ":disabled" ) so that fieldset[disabled] works
        return this.name && !jQuery( this ).is( ":disabled" ) &&
            rsubmittable.test( this.nodeName ) && !rsubmitterTypes.test( type ) &&
            (this.checked || !rradioType.test( type ));
    } )
    .map( function( _i, elem ) {
        let val = '';
        if (rjsonlistType.test(jQuery( this ).data('type'))){
           val = JSON.stringify(jQuery( this ).find('table').bootstrapTable('getData'));
        } else {
            val = jQuery( this ).val();
            if (rcheckableType.test(this.type)){
                if (this.name.includes('__in' ) || jQuery(this).data('in')) {
                    val = jQuery(this).prop('checked') ? val : null;
                } else {
                    val = jQuery(this).prop('checked') ? "on" : "off";
                }
            }
        }

        if ( val === null ) {
            return { name: elem.name, value: val };
        }

        if ( Array.isArray( val ) ) {
            return jQuery.map( val, function( val ) {
                return { name: elem.name, value: val.replace( rCRLF, "\r\n" ) };
            } );
        }

        return { name: elem.name, value: val.replace( rCRLF, "\r\n" ) };
    } ).get();
};

$.fn.serializeObject = function (blank=null) {
    const indexedArray = {};
    // const testSerializeArray = this.serializeArray();
    $.map(this.serializeArray(), (n, i) => {
        const $input = $(this).find(`[name=${n.name}]`);
        let val = n.value;
        let obj = indexedArray[n.name];

        if (obj) {
            if (!obj.push) {
                obj = [obj];
            }
            obj.push(val || '');
            val = obj;
        } else if (n.name.includes('__range')) {
            const input = $input.data('daterangepicker');
            val = `${input.startDate.format('YYYY-MM-DD')}, ${input.endDate.format('YYYY-MM-DD')}`;
        } else if ($input.data('type') === 'masked') {
            val = $input.cleanVal();
        }

        if ((n.name.includes('__in') || $input.data('in')) && val?.push){
            val = val.filter(item => item);
            if (!$input.prop('multiple')){
                val = val.join(',');
            }
        }

        if ($input.prop('multiple') && !val?.push) {
            val = [val]
        }

        if ($input.data('type') === 'summernote') {
            val = $($input.summernote('code')).text();
        }

        if ($input.data('type') === 'jsonlist') {
            indexedArray[n.name] = JSON.parse(val);
        } else if ($input.data('dict')){
            obj = indexedArray[$input.data('name')];
            obj = obj || {};
            if ($input.data('boolean')) {
                obj[n.name] = val === 'on';
            } else {
                obj[n.name] = val || blank;
            }
            indexedArray[$input.data('name')] = obj;
        } else {
            if (!!val || !$input.data('hidden-blank')) {
                if ($input.data('boolean')) {
                    indexedArray[n.name] = val === 'on';
                } else {
                    if (val === 'on' || val === 'off'){
                        indexedArray[n.name] = val === 'on';
                    } else {
                        indexedArray[n.name] = val || blank;
                    }
                }
            }
        }
    });

    return indexedArray;
};

$.fn.deserializeObject = function (data, prefixo) {
    let key, value, chave, field;
    for (key in data) {
        if (data.hasOwnProperty(key)) {
            chave = prefixo ? prefixo + key : '[name='+ key + ']';
            try {
                value = /\{.*\:*\}/g.test(data[key]) ? JSON.parse(data[key]) : data[key];
            } catch (e) {
                value = data[key];
            }
            field = this.find(chave);
            if (value && typeof value === 'object'){
                if(field.data('subscribe')) {
                    new Function(`${field.data('subscribe')}(${JSON.stringify(value)}, true);`)();
                } else if (Array.isArray(value)){
                    if (field.data('type') === 'jsonlist'){
                        field.find('table').bootstrapTable('load', value)
                    } else if (field.data('list')) {
                        field.val(value)[field.data('list')]('refresh');
                    } else  {
                        if (field.data('change')){
                            window[field.data('change')](value, this.find(chave));
                        } else if (field.data('in')){
                            value.map(val => field.filter(`[value=${val}]`).prop('checked', true));
                        } else {
                           field.val(value.id).trigger('change');
                        }
                    }
                } else {
                    if (field.data('change')){
                        window[field.data('change')](value, this.find(chave));
                    } else {
                       field.val(value.id).trigger('change');
                    }
                }
            } else {
                if (field.data('subscribe')) {
                    new Function(
                        `${field.data('subscribe')}([], true);`
                    )();
                }
                if (field.data('type') === 'jsonlist') {
                    field.find('table').bootstrapTable('load', value || [])
                }
                if (field.attr('type') === 'html') {
                    if (field.data('type') === 'number') {
                        field.html(parseFloat(value).toLocaleString('pt-br'));
                    } else if (field.data('type') === 'currency') {
                        field.html(parseFloat(value).toLocaleString('pt-br', {'minimumFractionDigits': 2, style: 'currency', currency: 'BRL'}));
                    } else {
                        field.html(value);
                    }
                } else if (field.attr('type') === 'checkbox') {
                    field.prop('checked', value);
                } else if (field.attr('type') === 'radio') {
                    field.filter(`[value=${value}]`).prop('checked', value);
                } else if (field.data('type') === 'masked') {
                    field.val(value).trigger('paste');
                } else if (field.data('type') === 'summernote') {
                    field.summernote('code', '');
                    field.summernote('editor.insertText', value);
                } else if (value && field.data('in')) {
                    field.val(value.split(',')).trigger('change');
                } else {
                    field.val(value).trigger('change');
                }
            }
        }
    }
};

$.fn.errorObject = function (res, form) {
    $('.tab'+form+'Error').remove();
    this.find('.formError').remove();
    this.find('.form-group').removeClass('has-error').removeClass('has-success');
    if (typeof res === 'object') {
        for (const r in res) {
            if (res.hasOwnProperty(r)) {
                const field = this.find(`[name=${r}]`);
                let parent_div = field.parent();
                if (field.data('subscribe')) {
                    const listObjectsClass = Function(`return ${field.data('subscribe').split('.')[0]}.objects`);
                    for (const f in res[r]) {
                        if (res[r].hasOwnProperty(f)) {
                            listObjectsClass()[f].form?.errorObject(res[r][f]);
                        }
                    }
                } else {
                    const newLabel = $('<label class="error formError m-l-md"></label>').html(res[r][0]);
                    if (parent_div.hasClass('input-group')) {
                        parent_div = parent_div.parent();
                    }
                    parent_div.addClass('has-error').append(newLabel);
                }

                if (form) {
                    parent_div.parents('.tab-pane').each(function () {
                        let t = $('[href=#' + $(this).attr("id") + ']');
                        if (!t.children().length) {
                            t.append(` <span class="label label-danger b-r-xl tab${form}Error">&nbsp</span>`);
                        }
                    });
                }

            }
        }
    }
};

function formError(res, form) {
    var newLabel;
    $('.tab'+form+'Error').remove();
    $('.' + form + ' .formError').remove();
    $('.form-group').removeClass('has-error').removeClass('has-success');
    for (var r in res) {
        if (res.hasOwnProperty(r)) {
            newLabel = $('<label class="error formError m-l-md"></label>');
            newLabel.html(res[r][0].message);
            $('.' + form + ' #id_' + r + '_div').addClass('has-error').append(newLabel).parents('.tab-pane').each(function () {
                var t = $('[href=#' + $(this).attr("id") + ']')
                if (!t.children().length) {
                    $(t).append(' <span class="label label-danger b-r-xl tab' + form + 'Error">1</span>')
                } else {
                    $(t).children('span').html(parseInt($(t).children('span').html()) + 1)
                }
            });
        }
    }
}
