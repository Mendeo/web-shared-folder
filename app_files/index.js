'use strict';
setClientLanguage();
performSelectButtons();
deleteFilesWarningDialog();
uploadProgressBar();

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

function uploadProgressBar()
{
	const uploadForm = document.getElementById('upload_files');
	if (!uploadForm) return;
	const inputFiles = document.querySelector('#upload_files input[type=file]');
	const errorFiled = document.querySelector('.error_message');
	const MAX_FILE_LENGTH = 2147483647;

	const progressBar = document.getElementById('progressBar');

	function showProgressBar()
	{
		progressBar.hidden = false;
	}

	function removeProgressBar()
	{
		progressBar.hidden = true;
	}

	const xhr = new XMLHttpRequest();
	xhr.upload.addEventListener('progress', (event) =>
	{
		if (event.total > MAX_FILE_LENGTH)
		{
			errorFiled.innerHTML = 'Maximum files upload size exceeded';
			removeProgressBar();
			xhr.abort();
			return;
		}
		const percentLoaded = Math.round((event.loaded / event.total) * 100);
		//console.log(percentLoaded);
		progressBar.value = percentLoaded;
	});
	xhr.addEventListener('load', () =>
	{
		progressBar.value = 0;
		removeProgressBar();
		window.location = window.location.href;
	});

	xhr.addEventListener('error', () =>
	{
		progressBar.value = 0;
		removeProgressBar();
		errorFiled.innerHTML = 'Error occurred!';
	});

	uploadForm.addEventListener('submit', (event) =>
	{
		event.preventDefault();
		const formData = new FormData(uploadForm);
		if (inputFiles.files.length === 0) return;
		const totalSize = filesSize(inputFiles.files);
		if (totalSize <= 5242880)
		{
			uploadForm.submit();
			return;
		}
		showProgressBar();
		xhr.open('post', location.href, true);
		xhr.send(formData);
	});

	function filesSize(files)
	{
		let size = 0;
		for (let file of files)
		{
			size += file.size;
		}
		return size;
	}
}