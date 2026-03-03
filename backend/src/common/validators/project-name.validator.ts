import {
  registerDecorator,
  ValidationOptions,
  ValidationArguments,
} from 'class-validator';
import { PROJECT_NAME_REGEX } from '../constants';

export function IsValidProjectName(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isValidProjectName',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown, _args: ValidationArguments) {
          if (typeof value !== 'string') return false;
          return PROJECT_NAME_REGEX.test(value);
        },
        defaultMessage(args: ValidationArguments) {
          return `${args.property} must be 3-63 chars, alphanumeric with hyphens/underscores only`;
        },
      },
    });
  };
}
