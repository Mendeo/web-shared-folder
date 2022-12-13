'use strict';
setClientLanguage();
performSelectButtons();
deleteFilesWarningDialog();

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

function performSelectButtons()
{
	const selectAllButton = document.getElementById('selectAll');
	const deselectAllButton = document.getElementById('deselectAll');
	const checkboxes = document.querySelectorAll('.main_container__first_column > input[type="checkbox"]');

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

function deleteFilesWarningDialog()
{
	if (sessionStorage.getItem('deleteWithoutAsk')) return;
	const dialog = document.getElementById('delete-warning-dialog');
	if (!dialog) return;
	const filesForm = document.getElementById('filesForm');
	const deleteButton = document.querySelector('#filesForm input[name="delete"');
	deleteButton.addEventListener('click', (event) =>
	{
		event.preventDefault();
		if (dialog.showModal)
		{
			dialog.showModal();
		}
		else
		{
			const message = document.getElementById('diaolog_message').innerText;
			if (confirm(message)) submit();
		}
	});
	if (dialog.showModal)
	{
		const doNotAsk = document.querySelector('#delete-warning-dialog input[type="checkbox"]');
		dialog.addEventListener('close', () =>
		{
			if (dialog.returnValue === 'yes')
			{
				if (doNotAsk.checked) sessionStorage.setItem('deleteWithoutAsk', true);
				submit();
			}
		});
	}

	function submit()
	{
		const deleteInput = document.createElement('input');
		deleteInput.type = 'hidden';
		deleteInput.name = 'delete';
		deleteInput.value = true;
		filesForm.append(deleteInput);
		filesForm.submit();
	}
}