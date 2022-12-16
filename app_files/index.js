'use strict';

setClientLanguage();
performSelectButtons();
deleteFilesWarningDialog();
filesSubmit();
dragAndDropFiles();

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
	const selectForm = document.getElementById('select_form');
	const deleteButton = document.querySelector('#select_form input[name="delete"');
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
		selectForm.append(deleteInput);
		selectForm.submit();
	}
}

function filesSubmit(formData)
{
	let uploadForm = null;
	if (!formData)
	{
		uploadForm = document.querySelector('.footer__upload_files_form');
		if (!uploadForm) return;
	}
	const errorFiled = document.querySelector('.error_message');
	const MAX_FILE_LENGTH = 2147483647;
	const progressBar = document.querySelector('.footer__controls > progress');
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
		progressBar.value = percentLoaded;
	});
	xhr.addEventListener('readystatechange', () =>
	{
		if (xhr.readyState === XMLHttpRequest.DONE && xhr.status === 200)
		{
			progressBar.value = 0;
			removeProgressBar();
			if (xhr.response)
			{
				errorFiled.innerHTML = xhr.response;
			}
			else
			{
				window.location = window.location.href;
			}
		}
	});
	xhr.addEventListener('error', () =>
	{
		progressBar.value = 0;
		removeProgressBar();
		errorFiled.innerHTML = 'Error occurred!';
	});

	if (!formData)
	{
		uploadForm.addEventListener('submit', (event) =>
		{
			event.preventDefault();
			const inputFiles = document.querySelector('.footer__upload_files_form input[type="file"]');
			if (inputFiles.files.length === 0) return;
			const totalSize = filesSize(inputFiles.files);
			if (totalSize <= 5242880)
			{
				uploadForm.submit();
				return;
			}
			formData = new FormData(uploadForm);
			submit(formData);
		});
	}
	else
	{
		submit(formData);
	}

	function submit(formData)
	{
		showProgressBar();
		xhr.open('post', location.href + '?xhr=true', true);
		xhr.send(formData);
	}

	function filesSize(files)
	{
		let size = 0;
		for (let file of files)
		{
			size += file.size;
		}
		return size;
	}

	function showProgressBar()
	{
		progressBar.hidden = false;
	}

	function removeProgressBar()
	{
		progressBar.hidden = true;
	}
}

function dragAndDropFiles()
{
	const dropZoneClass = 'footer__drag_and_drop__dragenter';
	const dropZone = document.querySelector('.footer__drag_and_drop');
	dropZone.classList.remove('hidden');
	dropZone.addEventListener('dragenter', (e) =>
	{
		e.preventDefault();
		dropZone.classList.add(dropZoneClass);
	});
	dropZone.addEventListener('dragleave', (e) =>
	{
		e.preventDefault();
		dropZone.classList.remove(dropZoneClass);
	});
	dropZone.addEventListener('dragover', (e) => e.preventDefault());
	dropZone.addEventListener('drop', (e)=>
	{
		e.preventDefault();
		dropZone.classList.remove(dropZoneClass);
		const formData = new FormData();
		for (let file of e.dataTransfer.files)
		{
			formData.append('upload_xhr', file);
		}
		filesSubmit(formData);
	});
}