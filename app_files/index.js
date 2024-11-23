'use strict';

const _checkboxes =  document.querySelectorAll('#select_form input[type="checkbox"]');

themeChanger();
setClientLanguage();
performSelectButtons();
preventDownloadIfNoFilesSelected();
backspaceToPreviousFolder();
/*---UPLOAD_SPLITTER---*/
deleteFilesWarningDialog();
upload();
dragAndDropFiles();
createFolderValidity();
renameFiles();
performCopyPaste();
/*---UPLOAD_SPLITTER---*/
function themeChanger()
{
	const THEME_STORAGE_NAME = 'selected-theme';
	const STORAGE_LIGHT_THEME = 'light';
	const STORAGE_DARK_THEME = 'dark';
	const STORAGE_AUTO_THEME = 'auto';

	const radioLight = document.getElementById('radio-light-theme');
	const radioDark = document.getElementById('radio-dark-theme');
	const radioAuto = document.getElementById('radio-auto-theme');

	const styleLight = document.getElementById('light-theme-css');
	const styleDark = document.getElementById('dark-theme-css');

	const selectedTheme = localStorage.getItem(THEME_STORAGE_NAME);
	setTheme(selectedTheme);

	radioLight.addEventListener('change', onThemeChange);
	radioDark.addEventListener('change', onThemeChange);
	radioAuto.addEventListener('change', onThemeChange);

	function setTheme(selectedTheme)
	{
		if (selectedTheme !== STORAGE_LIGHT_THEME && selectedTheme !== STORAGE_DARK_THEME && selectedTheme !== STORAGE_AUTO_THEME)
		{
			selectedTheme = STORAGE_AUTO_THEME;
			setThemeToLocalStorage(STORAGE_AUTO_THEME);
		}

		if (selectedTheme === STORAGE_LIGHT_THEME)
		{
			styleLight.media = 'all';
			styleDark.media = 'not all';
			radioLight.checked = true;
		}
		else if (selectedTheme === STORAGE_DARK_THEME)
		{
			styleLight.media = 'not all';
			styleDark.media = 'all';
			radioDark.checked = true;
		}
		else
		{
			styleLight.media = '(prefers-color-scheme: light)';
			styleDark.media = '(prefers-color-scheme: dark)';
			radioAuto.checked = true;
		}
	}

	function onThemeChange()
	{
		let selectedTheme = '';
		let ifSet = false;
		if (radioLight.checked)
		{
			selectedTheme = STORAGE_LIGHT_THEME;
			ifSet = true;
		}
		else if (radioDark.checked)
		{
			selectedTheme = STORAGE_DARK_THEME;
			ifSet = true;
		}
		else if (radioAuto.checked)
		{
			selectedTheme = STORAGE_AUTO_THEME;
			ifSet = true;
		}
		if (ifSet)
		{
			setThemeToLocalStorage(selectedTheme);
			setTheme(selectedTheme);
		}
	}

	function setThemeToLocalStorage(value)
	{
		localStorage.setItem(THEME_STORAGE_NAME, value);
	}
}

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
	const checkboxes = document.querySelectorAll('input[id^="item-checkbox-"]');
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

function preventDownloadIfNoFilesSelected()
{
	const downloadButton = document.querySelector('#select_form button[name="download"]');
	downloadButton.addEventListener('click', (e) =>
	{
		if (!hasSelectedChecboxes()) e.preventDefault();
	});
}

function hasSelectedChecboxes()
{
	for (let elem of _checkboxes)
	{
		if (elem.checked) return true;
	}
	return false;
}

function backspaceToPreviousFolder()
{
	const selectForm = document.getElementById('select_form');
	selectForm.focus();
	selectForm.addEventListener('keydown', (e) =>
	{
		if (e.code === 'Backspace' && location.pathname !== '/')
		{
			//history.back();
			const arr = location.pathname.split('/');
			let backPath = arr.slice(0, arr.length - 1).join('/');
			if (backPath === '') backPath = '/';
			location.assign(backPath);
		}
	});
}
/*---UPLOAD_SPLITTER---*/
function performCopyPaste()
{
	const items = [];
	const selectButton = document.getElementById('select_for_copy_or_move_button');
	const copyButton = document.getElementById('copy_button');
	const moveButton = document.getElementById('move_button');
	const selectForm = document.getElementById('select_form');

	const ITEMS_KEY = 'paste_items';
	const PATH_KEY = 'paste_from';
	const PASTE_TYPE_KEY = 'paste_type';

	performSelectForCopyOrMoveButton();
	performCopyOrPasteButtons();

	function performSelectForCopyOrMoveButton()
	{
		const selectButtonName = selectButton.innerText;
		selectButton.hidden = false;
		selectButton.addEventListener('click', (e) =>
		{
			e.preventDefault();
			for (let item of _checkboxes)
			{
				if (item.checked) items.push(item.name);
			}
			if (items.length === 0)
			{
				selectButton.innerText = selectButtonName;
				sessionStorage.removeItem(ITEMS_KEY);
				sessionStorage.removeItem(PATH_KEY);
			}
			else
			{
				sessionStorage.setItem(ITEMS_KEY, items.join(','));
				sessionStorage.setItem(PATH_KEY, decodeURI(location.pathname));
				selectButton.innerText = `${selectButtonName} (${items.length})`;
			}
			items.length = 0;
			copyButton.hidden = true;
			moveButton.hidden = true;
		});
	}

	function performCopyOrPasteButtons()
	{
		const dialog = document.getElementById('replace-warning-dialog');
		const dialogMessage = document.querySelector('#replace-warning-dialog [data-id="dialog_message"]');
		const doNotAsk = document.querySelector('#replace-warning-dialog input[type="checkbox"]');
		const copyButtonName = copyButton.innerText;
		const moveButtonName = moveButton.innerText;
		const items = sessionStorage.getItem(ITEMS_KEY);
		const itemsPath = sessionStorage.getItem(PATH_KEY);
		if (items && itemsPath && itemsPath !== location.pathname)
		{
			copyButton.innerText = `${copyButtonName} (${items.split(',').length})`;
			copyButton.hidden = false;
			moveButton.innerText = `${moveButtonName} (${items.split(',').length})`;
			moveButton.hidden = false;

			copyButton.addEventListener('click', (e) =>
			{
				onCopyOrMoveButtonsClick(e, 'copy');
			});
			moveButton.addEventListener('click', (e) =>
			{
				onCopyOrMoveButtonsClick(e, 'move');
			});
			if (dialog.showModal)
			{
				dialog.addEventListener('close', () =>
				{
					if (dialog.returnValue === 'ok')
					{
						if (doNotAsk.checked) sessionStorage.setItem('replace-without-ask', true);
						performClick(dialog.getAttribute('data-type'));
					}
				});
			}
		}

		function onCopyOrMoveButtonsClick(e, type)
		{
			e.preventDefault();
			if (sessionStorage.getItem('replace-without-ask'))
			{
				performClick(type);
			}
			else if (dialog.showModal)
			{
				dialog.setAttribute('data-type', type);
				dialog.showModal();
			}
			else
			{
				const message = dialogMessage.innerText;
				if (confirm(message)) performClick(type);
			}
		}

		function performClick(type)
		{
			sessionStorage.removeItem(ITEMS_KEY);
			sessionStorage.removeItem(PATH_KEY);
			submit(type);
		}

		function submit(type)
		{
			const itemsPathInput = document.createElement('input');
			itemsPathInput.type = 'hidden';
			itemsPathInput.name = PATH_KEY;
			itemsPathInput.value = itemsPath;

			const itemsInput = document.createElement('input');
			itemsInput.type = 'hidden';
			itemsInput.name = ITEMS_KEY;
			itemsInput.value = items;

			const typeInput = document.createElement('input');
			typeInput.type = 'hidden';
			typeInput.name = PASTE_TYPE_KEY;
			typeInput.value = type;

			selectForm.append(itemsPathInput);
			selectForm.append(itemsInput);
			selectForm.append(typeInput);
			selectForm.submit();
		}
	}
}

function deleteFilesWarningDialog()
{
	const dialog = document.getElementById('delete-warning-dialog');
	const dialogMessage = document.querySelector('#delete-warning-dialog [data-id="dialog_message"]');
	if (!dialog) return;
	const deleteButton = document.querySelector('#select_form button[name="delete"]');

	deleteButton.addEventListener('click', (event) =>
	{
		{
			const hsc = hasSelectedChecboxes();
			if (sessionStorage.getItem('delete-without-ask'))
			{
				if (!hsc) event.preventDefault();
				return;
			}
			event.preventDefault();
			if (!hsc) return;
		}

		if (dialog.showModal)
		{
			dialog.showModal();
		}
		else
		{
			const message = dialogMessage.innerText;
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
				if (doNotAsk.checked) sessionStorage.setItem('delete-without-ask', true);
				submit();
			}
		});
	}

	const selectForm = document.getElementById('select_form');
	function submit()
	{
		const tmpElement = document.createElement('input');
		tmpElement.type = 'hidden';
		tmpElement.name = 'delete';
		tmpElement.value = true;
		selectForm.append(tmpElement);
		selectForm.submit();
	}
}

function upload(formData, callback)
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
			if (typeof callback === 'function') callback(xhr.response);
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
	xhr.addEventListener('error', (err) =>
	{
		progressBar.value = 0;
		removeProgressBar();
		const msg = 'Error occurred!';
		if (typeof callback === 'function') callback(msg);
		errorFiled.innerHTML = msg;
		console.log(err);
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
				callback();
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
		progressBar.classList.remove('hidden_in_flow');
	}

	function removeProgressBar()
	{
		progressBar.classList.add('hidden_in_flow');
	}
}

function dragAndDropFiles()
{
	let uploadingInProgress = false;
	const dropZoneClass = 'footer__drag_and_drop__dragenter';
	const dropZone = document.querySelector('.footer__drag_and_drop');
	if (!dropZone) return;
	dropZone.classList.remove('hidden');
	dropZone.addEventListener('dragenter', (e) =>
	{
		e.preventDefault();
		if (!uploadingInProgress) dropZone.classList.add(dropZoneClass);
	});
	dropZone.addEventListener('dragleave', (e) =>
	{
		e.preventDefault();
		if (!uploadingInProgress) dropZone.classList.remove(dropZoneClass);
	});
	dropZone.addEventListener('dragover', (e) => e.preventDefault());
	dropZone.addEventListener('drop', (e)=>
	{
		e.preventDefault();
		if (!uploadingInProgress)
		{
			dropZone.classList.remove(dropZoneClass);
			const formData = new FormData();
			for (let file of e.dataTransfer.files)
			{
				formData.append('upload_xhr', file);
			}
			dropZone.classList.add('footer__drag_and_drop__while_upload');
			uploadingInProgress = true;
			upload(formData, () =>
			{
				uploadingInProgress = false;
				dropZone.classList.remove('footer__drag_and_drop__while_upload');
			});
		}
	});
}

function createFolderValidity()
{
	const input = document.querySelector('form[name="mk_dir"] > input[name="dir"]');
	if (!input) return;
	input.addEventListener('input', () =>
	{
		if (input.validity.patternMismatch)
		{
			input.setCustomValidity(input.getAttribute('data-invalid-message'));
		}
		else
		{
			input.setCustomValidity('');
		}
		input.reportValidity();
	});
}

function renameFiles()
{
	const dialog = document.getElementById('rename-dialog');
	if (!dialog || !dialog.showModal) return;
	const renameButtons = document.querySelectorAll('button[id^="rename-button-"]');
	const fileName = document.querySelector('#rename-dialog input[type="text"]');

	let oldNameBase64 = '';
	for (let rb of renameButtons)
	{
		rb.hidden = false;
		rb.addEventListener('click', (e) =>
		{
			e.preventDefault();
			const id = rb.id.split('-')[2];
			const checkboxBeforeButton = document.getElementById(`item-checkbox-${id}`);
			oldNameBase64 = checkboxBeforeButton.getAttribute('name');
			dialog.showModal();
		});
	}
	fileName.addEventListener('input', () =>
	{
		if (fileName.validity.patternMismatch)
		{
			fileName.setCustomValidity(fileName.getAttribute('data-invalid-message'));
		}
		else
		{
			fileName.setCustomValidity('');
		}
		fileName.reportValidity();
	});
	dialog.addEventListener('close', () =>
	{
		if (dialog.returnValue === 'ok')
		{
			submit(oldNameBase64, fileName.value);
		}
	});

	function submit(oldName, newName)
	{
		const selectForm = document.getElementById('select_form');
		const from = document.createElement('input');
		from.type = 'hidden';
		from.name = 'rename_from';
		from.value = oldName;
		selectForm.append(from);
		const to = document.createElement('input');
		to.type = 'hidden';
		to.name = 'rename_to';
		to.value = newName;
		selectForm.append(to);
		selectForm.submit();
	}
}
