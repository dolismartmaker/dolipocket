@extends('layouts.app')

@section('content')
<div class="max-w-md mx-auto bg-white p-6 rounded-lg shadow-sm">
	<h1 class="text-2xl font-bold mb-4">Créer un compte</h1>

	@if (!empty($error))
		<div class="bg-red-50 text-red-700 px-3 py-2 rounded mb-4 text-sm">{{ $error }}</div>
	@endif

	<form method="post" action="/signup" class="space-y-4" data-submit-once>
		<input type="hidden" name="token" value="{{ $csrf }}">

		<div>
			<label class="block text-sm font-medium mb-1" for="email">Email</label>
			<input id="email" name="email" type="email" required autocomplete="email"
				class="w-full border border-slate-300 rounded px-3 py-2">
		</div>

		<div>
			<label class="block text-sm font-medium mb-1" for="company">Nom de société</label>
			<input id="company" name="company" type="text" required
				class="w-full border border-slate-300 rounded px-3 py-2">
		</div>

		<label class="flex items-start gap-2 text-sm">
			<input type="checkbox" name="accept_terms" value="1" required class="mt-1">
			<span>J'accepte les <a href="/terms" class="underline">CGU</a>.</span>
		</label>

		<button type="submit" class="w-full bg-emerald-500 hover:bg-emerald-400 text-slate-900 font-semibold py-2 rounded" data-loading-text="Envoi du code en cours...">
			Recevoir un code de confirmation
		</button>
	</form>

	<p class="text-sm text-slate-500 mt-4">
		Déjà un compte ? <a href="/login" class="underline">Se connecter</a>
	</p>
</div>
@endsection
