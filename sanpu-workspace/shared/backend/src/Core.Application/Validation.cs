using Divakar.Sanpu.Core.Domain;
using FluentValidation;

namespace Divakar.Sanpu.Core.Application;

public static class Validation
{
    /// <summary>Runs a validator and throws a 422 AppException with field-level errors (camelCase field names).</summary>
    public static void Ensure<T>(IValidator<T> validator, T model)
    {
        var result = validator.Validate(model);
        if (result.IsValid) return;
        var errors = result.Errors
            .GroupBy(e => char.ToLowerInvariant(e.PropertyName[0]) + e.PropertyName[1..])
            .ToDictionary(g => g.Key, g => g.Select(e => e.ErrorMessage).Distinct().ToArray());
        throw new AppException(422, "validation_failed", "Some fields are not valid.", errors);
    }

    public static IRuleBuilderOptions<T, string> ValidEmail<T>(this IRuleBuilder<T, string> rule) =>
        rule.NotEmpty().WithMessage("Email is required.").Must(EmailAddress.IsValid).WithMessage("Enter a valid email address.");

    public static IRuleBuilderOptions<T, string> DisplayName<T>(this IRuleBuilder<T, string> rule) =>
        rule.NotEmpty().WithMessage("Name is required.").Length(2, 100).WithMessage("Use 2 to 100 characters.");

    public static IRuleBuilderOptions<T, string> Key<T>(this IRuleBuilder<T, string> rule, string pattern, int max) =>
        rule.NotEmpty().MaximumLength(max).Matches(pattern).WithMessage($"Use only the characters allowed by {pattern}.");
}

public sealed record NewsletterRequest(string Email);
public sealed class NewsletterValidator : AbstractValidator<NewsletterRequest>
{
    public NewsletterValidator() { RuleFor(x => x.Email).ValidEmail().MaximumLength(256); }
}

public sealed class LoginValidator : AbstractValidator<LoginRequest>
{
    public LoginValidator()
    {
        RuleFor(x => x.Email).ValidEmail();
        RuleFor(x => x.Password).NotEmpty().WithMessage("Password is required.").MaximumLength(PasswordPolicy.MaxLength);
    }
}

public sealed class RegisterValidator : AbstractValidator<RegisterRequest>
{
    public RegisterValidator()
    {
        RuleFor(x => x.Email).ValidEmail();
        RuleFor(x => x.DisplayName).DisplayName();
        RuleFor(x => x.Password).Custom((p, ctx) => { foreach (var m in PasswordPolicy.Check(p, ctx.InstanceToValidate.Email)) ctx.AddFailure(m); });
    }
}

public sealed class ForgotPasswordValidator : AbstractValidator<ForgotPasswordRequest>
{
    public ForgotPasswordValidator() { RuleFor(x => x.Email).ValidEmail().MaximumLength(256).WithMessage("Use at most 256 characters."); }
}

public sealed class ResetPasswordValidator : AbstractValidator<ResetPasswordRequest>
{
    public ResetPasswordValidator()
    {
        RuleFor(x => x.Token).NotEmpty().MaximumLength(200);
        RuleFor(x => x.Password).Custom((p, ctx) => { foreach (var m in PasswordPolicy.Check(p)) ctx.AddFailure(m); });
    }
}

public sealed class AcceptInvitationValidator : AbstractValidator<AcceptInvitationRequest>
{
    public AcceptInvitationValidator()
    {
        RuleFor(x => x.Token).NotEmpty().MaximumLength(200);
        RuleFor(x => x.DisplayName).DisplayName();
        RuleFor(x => x.Password).Custom((p, ctx) => { foreach (var m in PasswordPolicy.Check(p)) ctx.AddFailure(m); });
    }
}

public sealed class ChangePasswordValidator : AbstractValidator<ChangePasswordRequest>
{
    public ChangePasswordValidator()
    {
        RuleFor(x => x.CurrentPassword).NotEmpty();
        RuleFor(x => x.NewPassword).Custom((p, ctx) => { foreach (var m in PasswordPolicy.Check(p)) ctx.AddFailure(m); })
            .NotEqual(x => x.CurrentPassword).WithMessage("Choose a password you have not used just now.");
    }
}

public sealed class UpdateProfileValidator : AbstractValidator<UpdateProfileRequest>
{
    public UpdateProfileValidator()
    {
        RuleFor(x => x.DisplayName).DisplayName();
        RuleFor(x => x.Phone).Must(p => string.IsNullOrWhiteSpace(p) || Phone.IsValid(p)).WithMessage("Enter a phone number like +886912345678.");
        RuleFor(x => x.PreferredLanguage).NotEmpty().MaximumLength(10);
    }
}

public sealed class InviteUserValidator : AbstractValidator<InviteUserRequest>
{
    public InviteUserValidator()
    {
        RuleFor(x => x.Email).ValidEmail();
        RuleFor(x => x.DisplayName).DisplayName();
        RuleFor(x => x.UserType).Must(t => t is "Staff" or "Customer").WithMessage("Choose Staff or Customer.");
        RuleFor(x => x.RoleIds).NotEmpty().WithMessage("Choose at least one role.");
    }
}

public sealed class RoleUpsertValidator : AbstractValidator<RoleUpsertRequest>
{
    public RoleUpsertValidator()
    {
        RuleFor(x => x.RoleKey).Key("^[a-z][a-z0-9_]{1,49}$", 50);
        RuleFor(x => x.RoleName).NotEmpty().MaximumLength(100);
        RuleFor(x => x.Description).MaximumLength(500);
    }
}

public sealed class MenuUpsertValidator : AbstractValidator<MenuUpsertRequest>
{
    public MenuUpsertValidator()
    {
        RuleFor(x => x.MenuKey).Key("^[a-z][a-z0-9.\\-]{1,99}$", 100);
        RuleFor(x => x.Title).NotEmpty().MaximumLength(100);
        RuleFor(x => x.ApplicationArea).Must(a => a is "Admin" or "Customer").WithMessage("Choose Admin or Customer.");
        RuleFor(x => x.SortOrder).InclusiveBetween(0, 9999);
        RuleFor(x => x.IconKey).MaximumLength(50);
        RuleFor(x => x.RoutePath).Must((m, r) => r is null || (m.IsExternal ? r.StartsWith("https://") : r.StartsWith('/') && !r.StartsWith("//")))
            .WithMessage("Internal routes start with / ; external links must use https://.").MaximumLength(200);
    }
}

public sealed class ContentUpsertValidator : AbstractValidator<ContentUpsertRequest>
{
    public ContentUpsertValidator()
    {
        RuleFor(x => x.TemplateKey).Key("^[a-z][a-z0-9._]{1,99}$", 100);
        RuleFor(x => x.Locale).Must(l => l is "en").WithMessage("The apps are English-only: use en.");
        RuleFor(x => x.Kind).Must(k => k is "Content" or "Notification");
        RuleFor(x => x.Subject).NotEmpty().MaximumLength(200);
        RuleFor(x => x.Body).NotEmpty().MaximumLength(8000);
    }
}

/// <summary>Collects several field errors and throws one 422 (for simple request rules without a full validator class).</summary>
public sealed class FieldErrors
{
    private readonly Dictionary<string, List<string>> _errors = new();
    public FieldErrors Check(bool ok, string field, string message)
    {
        if (!ok) { if (!_errors.TryGetValue(field, out var l)) _errors[field] = l = []; l.Add(message); }
        return this;
    }
    public void ThrowIfAny()
    {
        if (_errors.Count > 0) throw new AppException(422, "validation_failed", "Some fields are not valid.", _errors.ToDictionary(k => k.Key, k => k.Value.ToArray()));
    }
}
