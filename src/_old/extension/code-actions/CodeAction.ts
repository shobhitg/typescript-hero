import {
    ClassLikeDeclaration,
    DeclarationIndex,
    DeclarationInfo,
    DeclarationVisibility,
    GenericDeclaration,
} from 'typescript-parser';
import { TextDocument } from 'vscode';

import { Container } from '../IoC';
import { iocSymbols } from '../IoCSymbols';
import { ClassManager } from '../managers/ClassManager';
import { ImportManager } from '../managers/ImportManager';
import { Logger } from '../utilities/winstonLogger';

/**
 * Interface for all codeactions that are generated by the typescript code action provider.
 *
 * @export
 * @interface CodeAction
 */
export interface CodeAction {

    /**
     * Executes the code action. Depending on the action, there are several actions performed.
     *
     * @returns {Promise<boolean>}
     *
     * @memberof CodeAction
     */
    execute(): Promise<boolean>;
}

/**
 * Code action that adds a missing import the the actual document.
 *
 * @export
 * @class AddImportCodeAction
 * @implements {CodeAction}
 */
export class AddImportCodeAction implements CodeAction {
    private static get logger(): Logger {
        return Container.get(iocSymbols.logger);
    }

    constructor(private document: TextDocument, private importToAdd: DeclarationInfo) { }

    /**
     * Executes the code action. Depending on the action, there are several actions performed.
     *
     * @returns {Promise<boolean>}
     *
     * @memberof AddImportCodeAction
     */
    public async execute(): Promise<boolean> {
        AddImportCodeAction.logger.debug(
            '[%s] add import for declaration "%s"',
            AddImportCodeAction.name,
            this.importToAdd.declaration.name,
        );
        const controller = await ImportManager.create(this.document);
        return controller.addDeclarationImport(this.importToAdd).commit();
    }
}

/**
 * Code action that adds all missing imports to the actual document, based on the non-local usages.
 *
 * @export
 * @class AddMissingImportsCodeAction
 * @implements {CodeAction}
 */
export class AddMissingImportsCodeAction implements CodeAction {
    private static get logger(): Logger {
        return Container.get(iocSymbols.logger);
    }

    constructor(private document: TextDocument, private resolveIndex: DeclarationIndex) { }

    /**
     * Executes the code action. Depending on the action, there are several actions performed.
     *
     * @returns {Promise<boolean>}
     *
     * @memberof AddMissingImportsCodeAction
     */
    public async execute(): Promise<boolean> {
        AddMissingImportsCodeAction.logger.debug(
            '[%s] add all missing imports for document "%s"',
            AddMissingImportsCodeAction.name,
            this.document.fileName,
        );
        const controller = await ImportManager.create(this.document);
        return controller.addMissingImports(this.resolveIndex).commit();
    }
}

/**
 * Code action that does literally nothing. Is used to "communicate" with the user. E.g. if
 * an import cannot be resolved, the lightbulb will show "cannot resolve <CLASS>".
 *
 * @export
 * @class NoopCodeAction
 * @implements {CodeAction}
 */
export class NoopCodeAction implements CodeAction {
    /**
     * Executes the code action. Depending on the action, there are several actions performed.
     *
     * @returns {Promise<boolean>}
     *
     * @memberof NoopCodeAction
     */
    public execute(): Promise<boolean> {
        return Promise.resolve(true);
    }
}

/**
 * Code action that does implement missing properties and methods from interfaces or abstract classes.
 *
 * @export
 * @class ImplementPolymorphElements
 * @implements {CodeAction}
 */
export class ImplementPolymorphElements implements CodeAction {
    private static get logger(): Logger {
        return Container.get(iocSymbols.logger);
    }

    constructor(
        private document: TextDocument,
        private managedClass: string,
        private polymorphObject: ClassLikeDeclaration & GenericDeclaration,
        private typeParameterMappings?: { [type: string]: string },
    ) { }

    /**
     * Executes the code action. Depending on the action, there are several actions performed.
     *
     * @returns {Promise<boolean>}
     *
     * @memberof ImplementPolymorphElements
     */
    public async execute(): Promise<boolean> {
        ImplementPolymorphElements.logger.debug(
            '[%s] implement polymorph elements for class "%s"',
            ImplementPolymorphElements.name,
            this.managedClass,
            { file: this.document.fileName },
        );
        const controller = await ClassManager.create(this.document, this.managedClass);
        let typeKeys;

        if (this.typeParameterMappings) {
            typeKeys = Object.keys(this.typeParameterMappings);
        }

        for (const property of this.polymorphObject.properties.filter(o => !controller.hasProperty(o.name))) {
            if (!property.visibility) {
                property.visibility = DeclarationVisibility.Public;
            }
            if (this.typeParameterMappings) {
                const type = property.type || '';
                if (typeKeys.indexOf(type) >= 0) {
                    property.type = this.typeParameterMappings[type];
                }
            }
            controller.addProperty(property);
        }

        for (const method of this.polymorphObject.methods.filter(o => !controller.hasMethod(o.name) && o.isAbstract)) {
            if (!method.visibility) {
                method.visibility = DeclarationVisibility.Public;
            }
            if (this.typeParameterMappings) {
                const type = method.type || '';
                if (typeKeys.indexOf(type) >= 0) {
                    method.type = this.typeParameterMappings[type];
                }
                for (const param of method.parameters) {
                    const paramType = param.type || '';
                    if (typeKeys.indexOf(paramType) >= 0) {
                        param.type = this.typeParameterMappings[paramType];
                    }
                }
            }
            controller.addMethod(method);
        }

        return controller.commit();
    }
}