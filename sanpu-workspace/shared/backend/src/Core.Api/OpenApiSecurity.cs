using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.OpenApi;
using Microsoft.OpenApi;

namespace Divakar.Sanpu.Core.Api;

/// <summary>Adds the JWT Bearer scheme (Swagger "Authorize" button) and documents permission codes + standard error responses per operation.</summary>
public sealed class OpenApiSecurity(string title) : IOpenApiDocumentTransformer, IOpenApiOperationTransformer
{
    public Task TransformAsync(OpenApiDocument document, OpenApiDocumentTransformerContext context, CancellationToken cancellationToken)
    {
        document.Info.Title = title + " API";
        document.Info.Description = "Portfolio prototype by Divakar. All data is fictional demo data. Errors use RFC 7807 ProblemDetails with a stable `code` and `correlationId`. " +
                                    "Get a token from POST /api/v1/auth/login, then click Authorize and paste it (without the word Bearer).";
        document.Components ??= new OpenApiComponents();
        document.Components.SecuritySchemes ??= new Dictionary<string, IOpenApiSecurityScheme>();
        document.Components.SecuritySchemes["Bearer"] = new OpenApiSecurityScheme
        {
            Type = SecuritySchemeType.Http, Scheme = "bearer", BearerFormat = "JWT", Description = "Short-lived access token from /api/v1/auth/login or /refresh."
        };
        document.Security ??= [];
        document.Security.Add(new OpenApiSecurityRequirement { [new OpenApiSecuritySchemeReference("Bearer", document)] = [] });
        return Task.CompletedTask;
    }

    public Task TransformAsync(OpenApiOperation operation, OpenApiOperationTransformerContext context, CancellationToken cancellationToken)
    {
        var metadata = context.Description.ActionDescriptor.EndpointMetadata;
        var anonymous = metadata.OfType<IAllowAnonymous>().Any();
        var permissions = metadata.OfType<HasPermissionAttribute>().Select(a => a.Policy!.Replace(SanpuHosting.PermissionPolicyPrefix, "").Replace("|", " or ")).ToList();
        operation.Responses ??= new OpenApiResponses();
        void Add(string status, string text) { if (!operation.Responses.ContainsKey(status)) operation.Responses[status] = new OpenApiResponse { Description = text }; }
        if (anonymous)
        {
            operation.Security = [];
            operation.Description = ((operation.Description ?? "") + " Anonymous endpoint.").Trim();
        }
        else
        {
            Add("401", "Missing, expired or revoked token (code: unauthorized | token_expired | session_revoked).");
            if (permissions.Count > 0)
            {
                Add("403", "Caller lacks the permission (code: forbidden).");
                operation.Description = ((operation.Description ?? "") + $" Requires permission: {string.Join(", ", permissions)}.").Trim();
            }
        }
        var method = context.Description.HttpMethod;
        if (method is "POST" or "PUT" or "DELETE") { Add("422", "Validation failed (field errors in `errors`)."); Add("409", "Conflict: duplicate, invalid state or stale row version."); }
        Add("429", "Rate limited.");
        return Task.CompletedTask;
    }
}
