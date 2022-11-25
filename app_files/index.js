'use strict';
let _lang = null;
for (let cookie of document.cookie.split(';'))
{
	const aux = cookie.split('=');
	const key = aux[0].trim();
	const value = aux[1].trim();
	if (key === 'lang')
	{
		_lang = value;
		break;
	}
}
if (!_lang)
{
	_lang = navigator.browserLanguage || navigator.language || navigator.userLanguage;
	if (_lang)
	{
		document.cookie = `lang=${_lang}; path=/; max-age=86400; samesite=strict`;
		location.reload();
	}
}