import { Client } from '../client/Client';
import { Command } from '../command/Command';
import { LocalizedCommandInfo } from '../types/LocalizedCommandInfo';
import { ResourceLoader } from '../types/ResourceLoader';
import { TemplateData } from '../types/TemplateData';
import { Logger, logger } from '../util/logger/Logger';
import { LangFileParser } from './LangFileParser';
import { Language } from './Language';
import { Util } from '../util/Util';
import * as fs from 'fs';
import * as glob from 'glob';
import * as path from 'path';

/**
 * Module providing localization support throughout the framework.
 * Allows client output to be translated to other languages
 * @module Lang
 */
export class Lang
{
	@logger private static logger: Logger;
	private static _instance: Lang;
	private client: Client;
	private commandInfo: { [command: string]: { [lang: string]: LocalizedCommandInfo } };
	private langs: { [lang: string]: Language };
	private meta: { [lang: string]: { [key: string]: any } };
	private constructor(client: Client)
	{
		if (Lang._instance)
			throw new Error('Cannot create multiple instances of Lang singleton. Use Lang.createInstance() instead');

		this.client = client;
		this.commandInfo = {};
		this.langs = {};
		this.meta = {};
	}

	/**
	 * Contains all loaded languages and their strings.
	 * This does not include localized command helptext.
	 * Rather than using this directly, loading stings with
	 * a {@link ResourceLoader} function is preferred
	 * @static
	 * @name langs
	 * @type {object}
	 */
	public static get langs(): { [lang: string]: Language }
	{
		if (!Lang._instance) throw new Error('Lang singleton instance has not been created.');
		return Lang._instance.langs;
	}

	/**
	 * Contains all available localization languages
	 * @static
	 * @name langNames
	 * @type {string[]}
	 */
	public static get langNames(): string[]
	{
		if (!Lang._instance) throw new Error('Lang singleton instance has not been created.');

		let langs: Set<string> = new Set();
		for (const commandName of Object.keys(Lang._instance.commandInfo))
			for (const lang of Object.keys(Lang._instance.commandInfo[commandName]))
				langs.add(lang);

		for (const lang of Object.keys(Lang.langs)) langs.add(lang);

		return Array.from(langs);
	}

	/**
	 * Create the singleton instance.
	 * Called automatically by the YAMDBF Client at startup
	 * @static
	 * @method createInstance
	 * @param {Client} client YAMDBF Client instance
	 * @returns {void}
	 */
	public static createInstance(client: Client): void
	{
		if (!Lang._instance) Lang._instance = new Lang(client);
	}

	/**
	 * Set a metadata key/value for a given language
	 * @static
	 * @method setMetaValue
	 * @param {string} lang Language to set metadata for
	 * @param {string} key Metadata key to set
	 * @param {any} value Metadata value to assign
	 * @returns {void}
	 */
	public static setMetaValue(lang: string, key: string, value: any): void
	{
		if (!Lang._instance) throw new Error('Lang singleton instance has not been created.');
		Util.assignNestedValue(Lang._instance.meta, [lang, key], value);
	}

	/**
	 * Get a metadata value by key for a given language
	 * @static
	 * @method getMetaValue
	 * @param {string} lang Language to get metadata for
	 * @param {string} key Metadata key to get
	 * @returns {any}
	 */
	public static getMetaValue(lang: string, key: string): any
	{
		if (!Lang._instance) throw new Error('Lang singleton instance has not been created.');
		return Util.getNestedValue(Lang._instance.meta, [lang, key]);
	}

	/**
	 * Get all metadata for a given language
	 * @static
	 * @method getMetadata
	 * @param {string} lang Language to get metadata for
	 * @returns {object}
	 */
	public static getMetadata(lang: string): { [key: string]: any }
	{
		if (!Lang._instance) throw new Error('Lang singleton instance has not been created.');
		return Lang._instance.meta[lang] || {};
	}

	/**
	 * Load localization files from the Client's `localeDir`.
	 * Called automatically by the YAMDBF Client at startup
	 * @static
	 * @method loadLocalizations
	 * @returns {void}
	 */
	public static loadLocalizations(): void
	{
		if (!Lang._instance) throw new Error('Lang singleton instance has not been created.');

		const langNameRegex: RegExp = /\/([^\/\.]+)(?:\.[^/]+)?\.lang$/;

		let langs: { [key: string]: string[] } = {};
		let allLangFiles: string[] = [];
		Lang.setMetaValue('en_us', 'name', 'English');
		allLangFiles.push(...glob.sync(`${path.join(__dirname, './en_us')}/**/*.lang`));
		if (Lang._instance.client.localeDir)
			allLangFiles.push(...glob.sync(`${Lang._instance.client.localeDir}/**/*.lang`));

		for (const langFile of allLangFiles)
		{
			if (!langNameRegex.test(langFile)) continue;
			const langName: string = langFile.match(langNameRegex)[1];
			if (!langs[langName]) langs[langName] = [];
			langs[langName].push(langFile);
		}

		for (const langName of Object.keys(langs))
		{
			for (const langFile of langs[langName])
			{
				if (!langNameRegex.test(langFile)) continue;
				const loadedLangFile: string = fs.readFileSync(langFile).toString();
				const parsedLanguageFile: Language = LangFileParser.parseFile(langName, loadedLangFile);

				if (typeof Lang._instance.langs[langName] !== 'undefined')
					Lang._instance.langs[langName].concat(parsedLanguageFile);
				else
					Lang._instance.langs[langName] = parsedLanguageFile;
			}
		}

		Lang.logger.info('Lang', `Loaded string localizations for ${Object.keys(Lang.langs).length} languages`);
	}

	/**
	 * Load any command localizations and assign them to commands
	 * Called automatically by the YAMDBF Client at startup
	 * @static
	 * @method loadCommandLocalizations
	 * @returns {void}
	 */
	public static loadCommandLocalizations(): void
	{
		if (!Lang._instance) throw new Error('Lang singleton instance has not been created.');

		for (const command of Lang._instance.client.commands.values())
		{
			let localizationFile: string =
				glob.sync(`${Lang._instance.client.commandsDir}/**/${command.name}.lang.json`)[0];
			if (!localizationFile) continue;
			let localizations: { [name: string]: LocalizedCommandInfo };
			try { localizations = require(localizationFile); }
			catch (err) { continue; }
			Lang._instance.commandInfo[command.name] = localizations;
		}

		const helpTextLangs: Set<string> = new Set();
		for (const command of Object.keys(Lang._instance.commandInfo))
			for (const lang of Object.keys(Lang._instance.commandInfo[command]))
				helpTextLangs.add(lang);

		Lang.logger.info('Lang', `Loaded helptext localizations for ${helpTextLangs.size} languages`);
	}

	/**
	 * Get localized Command info, defaulting to the info
	 * given in the Command's constructor
	 * @static
	 * @method getCommandInfo
	 * @param {Command} command Command to get localized info for
	 * @param {string} lang Language to get the localized info in
	 * @returns {LocalizedCommandInfo}
	 */
	public static getCommandInfo(command: Command, lang: string): LocalizedCommandInfo
	{
		if (!Lang._instance) throw new Error('Lang singleton instance has not been created.');

		if (!command) throw new Error('A Command must be given for which to get Command info.');
		let desc: string, info: string, usage: string;
		if (!Lang._instance.commandInfo[command.name]
			|| (Lang._instance.commandInfo[command.name]
				&& !Lang._instance.commandInfo[command.name][lang]))
			return { desc, info, usage } = command;

		desc = Lang._instance.commandInfo[command.name][lang].desc || command.desc;
		info = Lang._instance.commandInfo[command.name][lang].info || command.info;
		usage = Lang._instance.commandInfo[command.name][lang].usage || command.usage;

		return { desc, info, usage };
	}

	/**
	 * Get a string resource for the given language, replacing any
	 * templates with the given data and evaluating any embedded
	 * template scripts
	 * @static
	 * @method res
	 * @param {string} lang Language to get a string resource for
	 * @param {string} key String key to get
	 * @param {TemplateData} [data] Values to replace in the string
	 * @returns {string}
	 */
	public static res(lang: string, key: string, data: TemplateData = {}): string
	{
		if (!Lang.langs[lang]) return `${lang}::${key}`;
		const maybeTemplates: RegExp = /^{{ *[a-zA-Z]+ *\?}}[\t ]*\n|{{ *[a-zA-Z]+ *\?}}/gm;
		const scriptTemplate: RegExp = /^{{!([\s\S]+)!}}[\t ]*\n|{{!([\s\S]+)!}}/m;
		const strings: { [key: string]: string } = Lang.langs[lang].strings;
		let loadedString: string = strings[key];

		if (!loadedString) return `${lang}::${key}`;
		if (typeof data === 'undefined') return loadedString;

		for (const template of Object.keys(data))
		{
			// Skip maybe templates so they can be removed properly later
			if (new RegExp(`{{ *${template} *\\?}}`, 'g').test(loadedString)
				&& (data[template] === '' || data[template] === undefined)) continue;

			loadedString = loadedString.replace(
				new RegExp(`{{ *${template} *\\??}}`, 'g'), () => data[template]);
		}

		const scriptTemplates: RegExp = new RegExp(scriptTemplate, 'gm');
		if (scriptTemplates.test(loadedString))
		{
			const resourceLoader: ResourceLoader = Lang.createResourceLoader(lang);
			for (const scriptData of loadedString.match(scriptTemplates))
			{
				let functionBody: string =
					scriptData.match(scriptTemplate)[1] || scriptData.match(scriptTemplate)[2];

				let script: Function = new Function('args', 'res', functionBody);

				let result: string;
				try { result = script(data, resourceLoader); }
				catch (err) { throw new Error(`in embedded localization script for: ${lang}::${key}\n${err}`); }

				// Try to coerce an implicit return
				if (typeof result === 'undefined')
					try
					{
						functionBody = `return ${functionBody.replace(/^[\s]+/, '')}`;
						script = new Function('args', 'res', functionBody);
						result = script(data, resourceLoader);
					}
					catch (err) {}

				if (/^{{!([\s\S]+)!}}[\t ]*\n/.test(scriptData) && result !== '')
					loadedString = loadedString.replace(scriptData, () => `${result}\n`);
				else loadedString = loadedString.replace(scriptData, () => result);
			}
		}

		return loadedString
			.replace(maybeTemplates, '')
			.replace(/\\n/g, '\n');
	}

	/**
	 * Takes a language string and returns a function that loads string
	 * resources for that specific language
	 * @static
	 * @method createResourceLoader
	 * @param {string} lang The language to create a loader for
	 * @returns {ResourceLoader}
	 */
	public static createResourceLoader(lang: string): ResourceLoader
	{
		return (key: string, data?: TemplateData) => Lang.res(lang, key, data);
	}
}
