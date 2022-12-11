'use strict';
setClientLanguage();
showSelectButtons();

function setClientLanguage()
{
	let _lang = null;
	for (let cookie of document.cookie.split(';'))
	{
		const aux = cookie.split('=');
		const key = aux[0].trim();
		const value = aux[1].trim();
		if (key === 'lang' || key == 'nav_lang')
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
			document.cookie = `nav_lang=${_lang}; path=/; samesite=strict`;
			location.reload();
		}
	}
}

function showSelectButtons()
{
	const selectAllButton = document.getElementById('selectAll');
	const deselectAllButton = document.getElementById('deselectAll');
	const checkboxes = document.querySelectorAll('.main_container__first_column > input[type="checkbox"]');
	console.log(checkboxes);

	selectAllButton.addEventListener('click', (event) =>
	{
		event.preventDefault();
		checkboxes.forEach((checkbox) => setCheckbox(checkbox, true));
	});

	deselectAllButton.addEventListener('click', (event) =>
	{
		event.preventDefault();
		checkboxes.forEach((checkbox) => setCheckbox(checkbox, false));
	});
	selectAllButton.hidden = false;
	deselectAllButton.hidden = false;

	function setCheckbox(checkbox, value)
	{
		if (value)
		{
			checkbox.checked = true;
		}
		else
		{
			checkbox.checked = false;
		}
	}
}