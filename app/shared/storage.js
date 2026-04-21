import { STORAGE_KEY, createDefaultState, normalizeState } from "./schema.js";

export async function getState() {
	const stored = await storageGet(STORAGE_KEY);
	return normalizeState(stored[STORAGE_KEY]);
}

export async function setState(nextState) {
	await storageSet({
		[STORAGE_KEY]: normalizeState(nextState)
	});
}

export async function updateState(updater) {
	const currentState = await getState();
	const nextState = await updater(currentState);
	await setState(nextState);
	return nextState;
}

export async function ensureState() {
	const currentState = await getState();
	if (!currentState || !currentState.version) {
		const defaults = createDefaultState();
		await setState(defaults);
		return defaults;
	}

	return currentState;
}

function storageGet(keys) {
	return new Promise(function(resolve) {
		chrome.storage.local.get(keys, resolve);
	});
}

function storageSet(value) {
	return new Promise(function(resolve, reject) {
		chrome.storage.local.set(value, function() {
			if (chrome.runtime.lastError) {
				reject(chrome.runtime.lastError);
				return;
			}

			resolve();
		});
	});
}
