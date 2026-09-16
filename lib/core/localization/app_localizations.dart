import 'package:flutter/material.dart';
import 'package:flutter/cupertino.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../constants/app_constants.dart';
import '../../models/payment.dart';

class AppLocalizations {
  const AppLocalizations(this.locale);

  final Locale locale;

  static const supportedLocales = [
    Locale('rw'),
    Locale('fr'),
    Locale('en'),
  ];

  static const delegate = _AppLocalizationsDelegate();
  static const delegates = [delegate];
  static const materialDelegate = _MaterialLocalizationsDelegate();
  static const widgetsDelegate = _WidgetsLocalizationsDelegate();
  static const cupertinoDelegate = _CupertinoLocalizationsDelegate();

  static AppLocalizations of(BuildContext context) {
    return Localizations.of<AppLocalizations>(context, AppLocalizations) ??
        const AppLocalizations(Locale('rw'));
  }

  bool get isFrench => locale.languageCode == 'fr';
  bool get isEnglish => locale.languageCode == 'en';

  String _t({required String rw, required String fr, required String en}) {
    if (isFrench) return fr;
    if (isEnglish) return en;
    return rw;
  }

  String get languageName => _t(rw: 'Kinyarwanda', fr: 'Francais', en: 'English');
  String languageLabel(Locale locale) => switch (locale.languageCode) {
        'fr' => 'Francais',
        'en' => 'English',
        _ => 'Kinyarwanda',
      };
  String get settings => _t(rw: 'Igenamiterere', fr: 'Parametres', en: 'Settings');
  String get notifications => _t(rw: 'Imenyesha', fr: 'Notifications', en: 'Notifications');
  String get locationPermission => _t(rw: 'Uruhushya rwo kumenya aho uri', fr: 'Autorisation de localisation', en: 'Location permission');
  String get language => _t(rw: 'Ururimi', fr: 'Langue', en: 'Language');
  String get appearance => _t(rw: 'Imigaragarire', fr: 'Apparence', en: 'Appearance');
  String get security => _t(rw: 'Umutekano', fr: 'Securite', en: 'Security');
  String get privacyPolicy => _t(rw: 'Politiki y’ibanga', fr: 'Politique de confidentialite', en: 'Privacy Policy');
  String get termsOfService => _t(rw: 'Amategeko yo gukoresha', fr: 'Conditions d’utilisation', en: 'Terms of Service');
  String get locationNotice => _t(rw: 'FEM C@BS ikoresha aho uri neza kugira ngo iguhuza n’abashoferi no gukurikirana urugendo ruri gukorwa. Aya makuru ntashorwa.', fr: 'FEM C@BS utilise votre position precise pour vous mettre en relation avec les chauffeurs et suivre un trajet actif. Ces donnees ne sont jamais vendues.', en: 'FEM C@BS uses your precise location to match you with drivers and track an active ride. This data is never sold.');
  String get locationDialogTitle => _t(rw: 'Uruhushya rwo kumenya aho uri', fr: 'Autorisation de localisation', en: 'Location permission');
  String get locationDialogBody => _t(rw: 'FEM C@BS ikoresha aho uri kugira ngo yerekane aho uhera ku ikarita no gukurikirana urugendo ruri gukorwa. Ruhindure mu igenamiterere ry’igikoresho.', fr: 'FEM C@BS utilise votre position pour afficher votre point de depart sur la carte et suivre un trajet actif. Gerez-la dans les parametres de votre appareil.', en: 'FEM C@BS uses your location to show your pickup point on the map and track an active ride. Manage it in your device settings.');
  String get ok => _t(rw: 'Yego', fr: 'OK', en: 'OK');
  String get chooseLanguage => _t(rw: 'Hitamo ururimi', fr: 'Choisir la langue', en: 'Choose language');
  String get languageChanged => _t(rw: 'Ururimi rwahinduwe.', fr: 'La langue a ete modifiee.', en: 'Language changed.');
  String get welcomeBack => _t(rw: 'Murakaza neza', fr: 'Bon retour', en: 'Welcome back');
  String get loginSubtitle => _t(rw: 'Injira kugira ngo utegeke urugendo.', fr: 'Connectez-vous pour reserver votre trajet.', en: 'Log in to book your ride.');
  String get phoneOrEmail => _t(rw: 'Numero ya telefoni cyangwa imeyili', fr: 'Numero de telephone ou e-mail', en: 'Phone number or email');
  String get password => _t(rw: 'Ijambo ry’ibanga', fr: 'Mot de passe', en: 'Password');
  String get forgotPassword => _t(rw: 'Wibagiwe ijambo ry’ibanga?', fr: 'Mot de passe oublie ?', en: 'Forgot password?');
  String get login => _t(rw: 'Injira', fr: 'Se connecter', en: 'Log in');
  String get signUp => _t(rw: 'Iyandikishe', fr: 'S’inscrire', en: 'Sign up');
  String get noAccount => _t(rw: 'Nta konti ufite? ', fr: 'Vous n’avez pas de compte ? ', en: 'Don’t have an account? ');
  String get getStarted => _t(rw: 'Tangira', fr: 'Commencer', en: 'Get started');
  String get safeReliableRides => _t(rw: 'Ingendo zizewe kandi zidahenze, igihe cyose uzikeneye.', fr: 'Des trajets surs et fiables, chaque fois que vous en avez besoin.', en: 'Safe and reliable rides, whenever you need them.');
  String get enterPassword => _t(rw: 'Andika ijambo ry’ibanga', fr: 'Saisissez votre mot de passe', en: 'Enter your password');
  String get previewMode => _t(rw: 'Uburyo bwo kureba: serivisi yo kwinjira ntirahuza. Kwinjira bikorera kuri iki gikoresho gusa.', fr: 'Mode apercu : le service d’authentification n’est pas encore connecte. La connexion fonctionne uniquement sur cet appareil.', en: 'Preview mode: the authentication backend is not connected, so sign-in runs on this device only.');
  String get signInFailed => _t(rw: 'Kwinjira ntibishobotse ubu. Ongera ugerageze.', fr: 'Connexion impossible pour le moment. Veuillez reessayer.', en: 'We could not sign you in right now. Please try again.');
  String get previewSignedIn => _t(rw: 'Winjiye mu buryo bwo kureba (serivisi ntirahuza).', fr: 'Session apercu activee (service non connecte).', en: 'Signed in with a preview session (backend not connected yet).');
  String get tagline => _t(rw: 'Urugendo rwawe. Uburyo bwawe.', fr: 'Votre trajet. Votre choix.', en: 'Your ride. Your way.');
  String get home => _t(rw: 'Ahabanza', fr: 'Accueil', en: 'Home');
  String get activity => _t(rw: 'Ibikorwa', fr: 'Activite', en: 'Activity');
  String get profile => _t(rw: 'Umwirondoro', fr: 'Profil', en: 'Profile');
  String get existingAccount => _t(rw: 'Usanzwe ufite konti? ', fr: 'Vous avez deja un compte ? ', en: 'Already have an account? ');
  String get whereGoing => _t(rw: 'Ugiye he?', fr: 'Ou allez-vous ?', en: 'Where are you going?');
  String get pickup => _t(rw: 'Aho uhera', fr: 'Depart', en: 'Pickup');
  String get destination => _t(rw: 'Aho ujya', fr: 'Destination', en: 'Destination');
  String get chooseDestination => _t(rw: 'Hitamo aho ujya', fr: 'Choisir une destination', en: 'Choose destination');
  String get setPickup => _t(rw: 'Shyiraho aho uhera', fr: 'Definir le depart', en: 'Set pickup location');
  String get useCurrentLocation => _t(rw: 'Koresha aho ndi ubu', fr: 'Utiliser ma position actuelle', en: 'Use current location');
  String get findingLocation => _t(rw: 'Turashaka aho uri…', fr: 'Recherche de votre position…', en: 'Finding your location…');
  String get setupRide => _t(rw: 'Tegura urugendo', fr: 'Configurer le trajet', en: 'Set up ride');
  String get bookRide => _t(rw: 'Tegura urugendo', fr: 'Reserver un trajet', en: 'Book a ride');
  String get recentDestinations => _t(rw: 'Aho uheruka kujya', fr: 'Destinations recentes', en: 'Recent destinations');
  String get chooseRide => _t(rw: 'Hitamo urugendo', fr: 'Choisir un trajet', en: 'Choose a ride');
  String get vehicleOptions => _t(rw: 'Amahitamo y’imodoka', fr: 'Options de vehicule', en: 'Vehicle options');
  String get rideType => _t(rw: 'Ubwoko bw’urugendo', fr: 'Type de trajet', en: 'Ride type');
  String get chooseRideType => _t(rw: 'Wifuza urugendo uruhe?', fr: 'Quel type de trajet souhaitez-vous ?', en: 'What kind of ride do you want?');
  String get rideTypeHint => _t(rw: 'Hitamo urugendo rw’iwanyu cyangwa urugendo muhuriraho muri bije igice. ', fr: 'Choisissez un trajet prive ou partage que vous divisez. ', en: 'Choose a private trip or a shared ride you split with others. ');
  String get privateRide => _t(rw: 'Urugendo rw’iwanyu', fr: 'Trajet prive', en: 'Private ride');
  String get privateRideDescription => _t(rw: 'Imodoka njya yawe. Nta yandi mabage cyangwa ahagarara byo hagati.', fr: 'Une voiture rien que pour vous. Aucun arret supplementaire.', en: 'A car just for you. No extra stops along the way.');
  String get privateRideNote => _t(rw: 'Wifata urugendo rwose wenyine, ku kigero gisanzwe.', fr: 'Vous prenez l’integralite du trajet seul, au tarif standard.', en: 'You get the whole trip to yourself at the standard fare.');
  String get shareRide => _t(rw: 'Urugendo muhuriraho', fr: 'Trajet partage', en: 'Share ride');
  String get shareRideDescription => _t(rw: 'Urugeraniranya n’abagenzi bajya ahantu hamwe. Wegukana igice cyo guhenduka.', fr: 'Vous partagez avec d’autres passagers allant dans la meme direction. Vous pouvez economiser.', en: 'Ride with other passengers going your way and save on the fare.');
  String get shareRideNote => _t(rw: 'Hari ubwo kujya no kuza kuri abandi bagenzi bishobora kongera urugendo gato.', fr: 'Les detours pour prendre ou depose d’autres passagers peuvent allonger le trajet.', en: 'Collecting or dropping other riders may add a short detour to your trip.');
  String get saveUpTo => _t(rw: 'Bika kugeza kuri', fr: 'Economisez jusqu’a', en: 'Save up to');
  String get shareSavings => _t(rw: 'Byazigamwe', fr: 'Economies du partage', en: 'Share savings');
  String get findRide => _t(rw: 'Shakisha urugendo', fr: 'Trouver un trajet', en: 'Find Ride');
  String get comfortable => _t(rw: 'Byoroshye', fr: 'Confortable', en: 'Comfortable');
  String get sedanSuv => _t(rw: 'Sedan / SUV', fr: 'Berline / SUV', en: 'Sedan / SUV');
  String get ecoFriendly => _t(rw: 'Bitangiza ibidukikije', fr: 'Ecologique', en: 'Eco Friendly');
  String get safeReliable => _t(rw: 'Byizewe kandi bidahenze', fr: 'Sur et fiable', en: 'Safe & Reliable');
  String get selectDestinationFirst => _t(rw: 'Banza uhitemo aho ugiya.', fr: 'Veuillez sélectionner votre destination.', en: 'Please select your destination.');
  String get selectPickupFirst => _t(rw: 'Banza uhitemo aho uhera.', fr: 'Veuillez sélectionner votre point de départ.', en: 'Please select your pickup location.');
  String get requestRide => _t(rw: 'Saba urugendo', fr: 'Demander une course', en: 'Request ride');
  String get rideNote => _t(rw: 'Inyandiko y’urugendo', fr: 'Note de course', en: 'Ride note');
  String get rideNoteOptional => _t(rw: 'Inyandiko (si ngombwa)', fr: 'Note (facultative)', en: 'Note (optional)');
  String get rideNoteHint => _t(rw: 'Ndifuza umushoferi ahagarare ku marembo… (si ngombwa)', fr: 'Ex. : m’attendre à la porte principale… (facultatif)', en: 'e.g. I am waiting at the main gate (optional)');
  String get rideNoteSelected => _t(rw: 'Byanditswe: ', fr: 'Note : ', en: 'Note: ');
  String get useThisLocation => _t(rw: 'Koresha aha hantu', fr: 'Utiliser cet endroit', en: 'Use this location');
  String get selectOnMap => _t(rw: 'Hitamo ku ikarita', fr: 'Choisir sur la carte', en: 'Select on map');
  String get moveMapHint => _t(rw: 'Imukura ikarita kugira ngo uhitemo aho ugiya, cyangwa ushakishe hano hasi.', fr: 'Déplacez la carte pour choisir votre destination, ou recherchez ci-dessous.', en: 'Move the map to choose your destination, or search below.');
  String get noVehicles => _t(rw: 'Nta modoka zihari ubu', fr: 'Aucun véhicule disponible', en: 'No vehicles available right now');
  String seatsLabel(int count) => _t(
        rw: 'Inyegamo $count',
        fr: '$count places',
        en: '$count seats',
      );
  String arrivesInMin(int minutes) => _t(
        rw: 'Ihageraho mu ~$minutes min',
        fr: 'Arrive dans ~$minutes min',
        en: 'Arrives in ~$minutes min',
      );
  String get requested => _t(rw: 'Byasabwe', fr: 'Demandee', en: 'Requested');
  String get destinationConfirmed => _t(rw: 'Emeza aho ugiya', fr: 'Confirmer la destination', en: 'Confirm destination');
  String get newPassword => _t(rw: 'Ijambo ry’ibanga rishya', fr: 'Nouveau mot de passe', en: 'New password');
  String get confirmPasswordShort => _t(rw: 'Subiramo ijambo ry’ibanga', fr: 'Repeter le mot de passe', en: 'Repeat password');
  String get setNewPassword => _t(rw: 'Shyiraho ijambo ry’ibanga', fr: 'Definir le nouveau mot de passe', en: 'Set new password');
  String get passwordResetDone => _t(rw: 'Ijambo ry’ibanga ryahinduwe. Ushobora kwinjira.', fr: 'Mot de passe modifie. Connectez-vous.', en: 'Password reset. You can now log in.');
  String get resetCodeLabel => _t(rw: 'Ikode yo gusubiza', fr: 'Code de verification', en: 'Verification code');
  String get continueLabel => _t(rw: 'Komeza', fr: 'Continuer', en: 'Continue');
  String get rideSummary => _t(rw: 'Incamake y’urugendo', fr: 'Resume du trajet', en: 'Ride summary');
  String get confirmRide => _t(rw: 'Emeza urugendo', fr: 'Confirmer le trajet', en: 'Confirm your ride');
  String get paymentMethod => _t(rw: 'Uburyo bwo kwishyura', fr: 'Mode de paiement', en: 'Payment method');
  String get vehicle => _t(rw: 'Imodoka', fr: 'Vehicule', en: 'Vehicle');
  String get searchDestination => _t(rw: 'Shakisha aho ujya', fr: 'Rechercher une destination', en: 'Search for a destination');
  String get savedPlaces => _t(rw: 'Aho wabitswe', fr: 'Lieux enregistres', en: 'Saved places');
  String get recentPlaces => _t(rw: 'Aho uheruka', fr: 'Lieux recents', en: 'Recent places');
  String get typeAddress => _t(rw: 'Andika aderesi cyangwa ubike aho ukunze kujya.', fr: 'Saisissez une adresse ou enregistrez vos lieux frequents.', en: 'Start typing an address, or save places you use often.');
  String get back => _t(rw: 'Subira inyuma', fr: 'Retour', en: 'Back');
  String get howWasRide => _t(rw: 'Uru rugendo rwagenze ute?', fr: 'Comment s\'est passe votre trajet ?', en: 'How was your ride?');
  String get ratingSaved => _t(rw: 'Amanota yabitswe.', fr: 'Evaluation enregistree.', en: 'Rating saved.');
  String get ratingSaveFailed => _t(rw: 'Ntitwabashije kubika amanota. Ongera ugerageze.', fr: 'Impossible d\'enregistrer l\'evaluation. Reessayez.', en: 'Could not save rating. Please try again.');
  String get confirmCashPayment => _t(rw: 'Emeza ko washyize amahera', fr: 'Confirmer le paiement en especes', en: 'Confirm cash payment');
  String get preparePayment => _t(rw: 'Tegura kwishyura', fr: 'Preparer le paiement', en: 'Prepare payment');
  String get paymentPendingNotice => _t(rw: 'Kwishyura bikorwa. Reba kuri telefoni yawe kugira ngo umeze ifunguzo ry\'amahera.', fr: 'Le paiement est en cours. Verifiez votre telephone pour confirmer.', en: 'Payment is being processed. Check your phone to confirm.');
  String paymentReference(String ref) => _t(rw: 'Irishe: $ref', fr: 'Reference : $ref', en: 'Reference: $ref');
  String get checkPaymentStatus => _t(rw: 'Genzura uko kwishyura byagenze', fr: 'Verifier l\'etat du paiement', en: 'Check payment status');
  String get previewBuild => _t(rw: 'Verisiyo yo kureba — serivisi ntirahuza', fr: 'Version apercu — service non connecte', en: 'Preview build — backend not connected');
  String get goodMorning => _t(rw: 'Mwaramutse', fr: 'Bonjour', en: 'Good morning');
  String get goodAfternoon => _t(rw: 'Mwiriwe', fr: 'Bon apres-midi', en: 'Good afternoon');
  String get goodEvening => _t(rw: 'Mwiriwe neza', fr: 'Bonsoir', en: 'Good evening');
  String get there => _t(rw: 'ahongaho', fr: 'la', en: 'there');
  String get invalidIdentifier => _t(rw: 'Andika nimero ya telefoni cyangwa imeyili yemewe', fr: 'Saisissez un numero de telephone ou e-mail valide', en: 'Enter a valid phone number or email');
  String get identifierRequired => _t(rw: 'Andika nimero ya telefoni cyangwa imeyili', fr: 'Saisissez votre numero de telephone ou e-mail', en: 'Enter your phone number or email');
  String get light => _t(rw: 'Urumuri', fr: 'Clair', en: 'Light');
  String get dark => _t(rw: 'Umwijima', fr: 'Sombre', en: 'Dark');
  String get system => _t(rw: 'Sisitemu', fr: 'Systeme', en: 'System');
  String get appearanceNotice => _t(rw: 'Uburyo bw’umwijima burategurwa. Porogaramu iri mu buryo bw’urumuri.', fr: 'Le mode sombre arrive. L’application est actuellement en mode clair.', en: 'Dark mode is coming. The app is in Light mode today.');
  String get securityTitle => _t(rw: 'Umutekano', fr: 'Securite', en: 'Security');
  String get securityBody => _t(rw: 'Kwinjira, kode za OTP no gusubizamo ijambo ry’ibanga bikorwa mu mutekano. Gufungura ukoresheje urutoki na kode bizongerwaho nyuma.', fr: 'La connexion, les codes OTP et la reinitialisation du mot de passe sont securises. Le deverrouillage biometrique sera ajoute plus tard.', en: 'Login, OTP codes and password resets are handled securely. Biometric unlock and passcode will be added in a security update.');
  String get allowLocation => _t(rw: 'Emera kumenya aho uri', fr: 'Autoriser la localisation', en: 'Allow location access');
  String get locationExplanation => _t(rw: 'FEM C@BS ikoresha aho uri kugira ngo ibone aho uhera kandi ifashe umushoferi kukugeraho. Ushobora kwandika aho uhera ubwawe.', fr: 'FEM C@BS utilise votre position pour trouver votre depart et aider le chauffeur a vous rejoindre. Vous pouvez aussi saisir le depart manuellement.', en: 'FEM C@BS uses your location to find your pickup point and help your driver reach you. You can still enter your pickup manually.');
  String get notNow => _t(rw: 'Ntabwo ari ubu', fr: 'Pas maintenant', en: 'Not now');
  String get allow => _t(rw: 'Emera aho uri', fr: 'Autoriser', en: 'Allow location');

  String get createAccount => _t(rw: 'Fungura konti yawe', fr: 'Creer votre compte', en: 'Create your account');
  String get lessThanMinute => _t(rw: 'Bifata munsi y’umunota.', fr: 'Cela prend moins d’une minute.', en: 'It takes less than a minute.');
  String get fullName => _t(rw: 'Amazina yose', fr: 'Nom complet', en: 'Full name');
  String get phoneNumber => _t(rw: 'Numero ya telefoni', fr: 'Numero de telephone', en: 'Phone number');
  String get email => _t(rw: 'Imeyili', fr: 'E-mail', en: 'Email');
  String get confirmPassword => _t(rw: 'Emeza ijambo ry’ibanga', fr: 'Confirmer le mot de passe', en: 'Confirm password');
  String get passwordHint => _t(rw: 'Nibura inyuguti 8, harimo inyuguti n’imibare', fr: 'Au moins 8 caracteres, lettres et chiffres', en: 'At least 8 characters, letters and numbers');
  String get agreeTerms => _t(rw: 'Ndemera Amategeko yo gukoresha na Politiki y’ibanga', fr: 'J’accepte les Conditions d’utilisation et la Politique de confidentialite', en: 'I agree to the Terms of Service and Privacy Policy');
  String get accountCreatedFailed => _t(rw: 'Ntitwashoboye gukora konti ubu. Ongera ugerageze.', fr: 'Nous ne pouvons pas creer votre compte maintenant. Reessayez.', en: 'We could not create your account right now. Please try again.');
  String get forgotPasswordDescription => _t(rw: 'Andika imeyili cyangwa numero ya telefoni, tukohereze kode yo gusubizamo ijambo ry’ibanga.', fr: 'Saisissez votre e-mail ou numero de telephone et nous vous enverrons un code de verification.', en: 'Enter your email or phone number and we will send you a verification code to reset your password.');
  String get emailOrPhone => _t(rw: 'Imeyili cyangwa numero ya telefoni', fr: 'E-mail ou numero de telephone', en: 'Email or phone number');
  String get sendVerification => _t(rw: 'Ohereza igenzura', fr: 'Envoyer la verification', en: 'Send verification');
  String get checkPhoneOrEmail => _t(rw: 'Reba telefoni cyangwa imeyili yawe', fr: 'Consultez votre telephone ou e-mail', en: 'Check your phone or email');
  String get codeArrivalHint => _t(rw: 'Niba kode itaje, genzura numero wanditse.', fr: 'Si le code n’arrive pas, verifiez le numero saisi.', en: 'If the code does not arrive, double-check the number you entered.');
  String get backToLogin => _t(rw: 'Subira ku kwinjira', fr: 'Retour a la connexion', en: 'Back to log in');
  String get completeProfile => _t(rw: 'Uzuza umwirondoro wawe', fr: 'Completez votre profil', en: 'Complete your profile');
  String get profilePhotoHint => _t(rw: 'Ifoto y’umwirondoro izongerwaho igihe kohereza amafoto bizaba bihujwe na serivisi.', fr: 'Une photo de profil pourra etre ajoutee lorsque les telechargements seront connectes au serveur.', en: 'A profile photo can be added when uploads are connected to the backend.');
  String get emergencyContactOptional => _t(rw: 'Umuntu wahamagara mu gihe cy’amage (si ngombwa)', fr: 'Contact d’urgence (facultatif)', en: 'Emergency contact (optional)');
  String get emergencyContactHint => _t(rw: 'Dukoresha ibi gusa kugira ngo tumuhamagare mu gihe cy’amage.', fr: 'Nous l’utilisons uniquement pour le joindre en cas d’urgence.', en: 'We only use this to reach someone for you in an emergency.');
  String get emergencyContactName => _t(rw: 'Amazina y’uwo wahamagara', fr: 'Nom du contact d’urgence', en: 'Emergency contact name');
  String get emergencyContactPhone => _t(rw: 'Numero y’uwo wahamagara', fr: 'Telephone du contact d’urgence', en: 'Emergency contact phone');
  String get continueLabel2 => continueLabel;
  String get welcomeAboard => _t(rw: 'Murakaza neza (uburyo bwo kureba).', fr: 'Bienvenue (session d’aperçu).', en: 'Welcome aboard (preview session).');
  String get verifyAccount => _t(rw: 'Emeza konti yawe', fr: 'Verifiez votre compte', en: 'Verify your account');
  String get verificationCodeSent => _t(rw: 'Andika kode yo kwemeza twohereje kuri telefoni yawe.', fr: 'Saisissez le code de verification envoye a votre telephone.', en: 'Enter the verification code we sent to your phone.');
  String get verify => _t(rw: 'Emeza', fr: 'Verifier', en: 'Verify');
  String resendCodeIn(int seconds) => _t(rw: 'Ongera wohereze kode mu masegonda $seconds', fr: 'Renvoyer le code dans $seconds s', en: 'Resend code in ${seconds}s');
  String get resendCode => _t(rw: 'Ongera wohereze kode', fr: 'Renvoyer le code', en: 'Resend code');
  String get newCodeRequested => _t(rw: 'Hasabwe kode nshya (uburyo bwo kureba: nta butumwa bwoherejwe).', fr: 'Un nouveau code a ete demande (aperçu : aucun message reel n’a ete envoye).', en: 'A new code has been requested (development preview: no real message was sent yet).');
  String get invalidVerificationCode => _t(rw: 'Andika kode twohereje kuri telefoni yawe.', fr: 'Saisissez le code envoye a votre telephone.', en: 'Enter the code we sent to your phone.');
  String get verificationFailed => _t(rw: 'Ntitwashoboye kwemeza kode ubu. Ongera ugerageze.', fr: 'Nous ne pouvons pas verifier votre code maintenant. Reessayez.', en: 'We could not verify your code right now. Please try again.');
  String get completed => _t(rw: 'Byarangiye', fr: 'Terminee', en: 'Completed');
  String get cancelled => _t(rw: 'Byahagaritswe', fr: 'Annulee', en: 'Cancelled');
  String get work => _t(rw: 'Akazi', fr: 'Travail', en: 'Work');
  String get other => _t(rw: 'Ahandi', fr: 'Autre', en: 'Other');
  String get payDriverDirectly => _t(rw: 'Ishyura umushoferi ako kanya', fr: 'Payez directement le chauffeur', en: 'Pay the driver directly');
  String get payWithMomo => _t(rw: 'Ishyura ukoresheje MoMo', fr: 'Payez avec MoMo', en: 'Pay with MoMo');
  String get payWithAirtel => _t(rw: 'Ishyura ukoresheje Airtel Money', fr: 'Payez avec Airtel Money', en: 'Pay with Airtel Money');
  String get payWithCard => _t(rw: 'Ishyura ukoresheje ikarita ya banki', fr: 'Payez avec une carte bancaire', en: 'Pay with a bank card');
  String get driverFound => _t(rw: 'Umushoferi yabonetse', fr: 'Chauffeur trouve', en: 'Driver found');
  String get waitingDriver => _t(rw: 'Dutegereje guhabwa umushoferi', fr: 'En attente de l’attribution d’un chauffeur', en: 'Waiting for driver assignment');
  String get driverDetailsPending => _t(rw: 'Amakuru y’umushoferi azagaragara serivisi imaze kumugenera urugendo.', fr: 'Les informations du chauffeur apparaitront des que le serveur lui attribuera votre course.', en: 'Driver details will appear here as soon as the backend assigns your driver.');
  String get driverOnWay => _t(rw: 'Umushoferi wawe ari mu nzira', fr: 'Votre chauffeur est en route', en: 'Your driver is on their way');
  String get driverArrived => _t(rw: 'Umushoferi ageze', fr: 'Chauffeur arrive', en: 'Driver arrived');
  String get arrived => _t(rw: 'Muhageze', fr: 'Arrive', en: 'Arrived');
  String get scheduled => _t(rw: 'Birasabwa', fr: 'Planifie', en: 'Scheduled');
  String get waitingForPayment => _t(rw: 'Dutegereje kwishyura', fr: 'En attente du paiement', en: 'Waiting for payment');
  String get changeDestination => _t(rw: 'Hindura aho ugiya', fr: 'Changer la destination', en: 'Change destination');
  String get destinationChanged => _t(rw: 'Aho ugiya byahinduwe', fr: 'Destination mise a jour', en: 'Destination updated');
  String get destinationChangeFailed => _t(rw: 'Ntitwashoboye guhindura aho ugiya. Ongera ugerageze.', fr: 'Nous ne pouvons pas changer la destination. Reessayez.', en: 'We could not change the destination. Please try again.');
  String get showPinToDriver => _t(rw: 'Mwereke umushoferi kode ikurikira:', fr: 'Montrez ce code au chauffeur :', en: 'Show your driver this code:');
  String get pinHint => _t(rw: 'Umushoferi azakoresha iyi kode gutangiza urugendo. Ntuyigireho undi muntu.', fr: 'Le chauffeur utilisera ce code pour demarrer la course. Ne le partagez pas.', en: 'The driver enters this code to start your trip. Do not share it.');
  String get licensePlate => _t(rw: 'Plaque: ', fr: 'Plaque : ', en: 'License plate: ');
  String get call => _t(rw: 'Hamagara', fr: 'Appeler', en: 'Call');
  String get message => _t(rw: 'Ubutumwa', fr: 'Message', en: 'Message');
  String get cancelRide => _t(rw: 'Hagarika urugendo', fr: 'Annuler la course', en: 'Cancel ride');
  String get cancelRideQuestion => _t(rw: 'Uhagarike uru rugendo?', fr: 'Annuler cette course ?', en: 'Cancel this ride?');
  String get keepRide => _t(rw: 'Komeza urugendo', fr: 'Garder la course', en: 'Keep ride');
  String get yourOnWay => _t(rw: 'Uri mu nzira', fr: 'Vous etes en route', en: 'You’re on your way');
  String get liveTrackingPending => _t(rw: 'Gukurikirana bizagaragara serivisi imaze gutanga aho umushoferi ari.', fr: 'Le suivi en direct apparaitra lorsque le serveur transmettra la position du chauffeur.', en: 'Live tracking appears here once the backend streams driver positions.');
  String get estimatedArrival => _t(rw: 'Igihe cyo kuhagera', fr: 'Arrivee estimee', en: 'Estimated arrival');
  String inMinutes(int minutes) => _t(rw: 'Mu minota $minutes', fr: 'Dans $minutes min', en: 'In $minutes min');
  String get backendUnavailable => _t(rw: 'Serivisi yo guhuza abashoferi ntirahuza.', fr: 'La mise en relation avec les chauffeurs n’est pas encore connectee.', en: 'Driver matching is not connected yet');
  String get backHome => _t(rw: 'Subira ahabanza', fr: 'Retour a l’accueil', en: 'Back to home');
  String get findingDriver => _t(rw: 'Turashaka umushoferi wawe', fr: 'Recherche de votre chauffeur', en: 'Finding your driver');
  String get matchingDriver => _t(rw: 'Turaguhuza n’umushoferi uri hafi. Akenshi bifata munsi y’umunota.', fr: 'Nous vous mettons en relation avec le chauffeur disponible le plus proche. Cela prend generalement moins d’une minute.', en: 'We are matching you with the nearest available driver. This usually takes less than a minute.');
  String get requiredField => _t(rw: 'Iki gice kirakenewe', fr: 'Ce champ est requis', en: 'This field is required');
  String get fullNameRequired => _t(rw: 'Andika amazina yawe yose', fr: 'Saisissez votre nom complet', en: 'Please enter your full name');
  String get fullNameInvalid => _t(rw: 'Andika amazina yawe yose', fr: 'Saisissez votre nom complet', en: 'Enter your full name');
  String get phoneRequired => _t(rw: 'Andika numero ya telefoni', fr: 'Saisissez votre numero de telephone', en: 'Please enter your phone number');
  String get phoneInvalid => _t(rw: 'Andika numero ya telefoni yemewe', fr: 'Saisissez un numero de telephone valide', en: 'Enter a valid phone number');
  String get emailRequired => _t(rw: 'Andika imeyili yawe', fr: 'Saisissez votre e-mail', en: 'Please enter your email');
  String get emailInvalid => _t(rw: 'Andika imeyili yemewe', fr: 'Saisissez une adresse e-mail valide', en: 'Enter a valid email address');
  String get passwordRequired => _t(rw: 'Andika ijambo ry’ibanga', fr: 'Saisissez un mot de passe', en: 'Please enter a password');
  String get passwordShort => _t(rw: 'Ijambo ry’ibanga rigomba kugira nibura inyuguti 8', fr: 'Le mot de passe doit contenir au moins 8 caracteres', en: 'Password must be at least 8 characters');
  String get passwordLetter => _t(rw: 'Ijambo ry’ibanga rigomba kugira inyuguti', fr: 'Le mot de passe doit contenir une lettre', en: 'Password must contain a letter');
  String get passwordNumber => _t(rw: 'Ijambo ry’ibanga rigomba kugira umubare', fr: 'Le mot de passe doit contenir un chiffre', en: 'Password must contain a number');
  String get confirmPasswordRequired => _t(rw: 'Emeza ijambo ry’ibanga', fr: 'Confirmez votre mot de passe', en: 'Please confirm your password');
  String get passwordMismatch => _t(rw: 'Amagambo y’ibanga ntahura', fr: 'Les mots de passe ne correspondent pas', en: 'Passwords do not match');
  String resetMessage(String identifier) => _t(
        rw: 'Twohereje ubutumwa bwo kwemeza kuri $identifier (uburyo bwo kureba: nta butumwa bwoherejwe).',
        fr: 'Nous avons envoye un message de verification a $identifier (version d’aperçu : aucun message reel n’a ete envoye).',
        en: 'We sent a verification message to $identifier (development build - no message was actually sent).',
      );
  String verificationCodeLength(int length) => _t(
        rw: 'Andika kode yo kwemeza y’imibare $length.',
        fr: 'Saisissez le code de verification a $length chiffres.',
        en: 'Enter the $length-digit verification code.',
      );
  String get rideDetails => _t(rw: 'Ibisobanuro by’urugendo', fr: 'Details du trajet', en: 'Ride details');
  String get date => _t(rw: 'Itariki', fr: 'Date', en: 'Date');
  String get driver => _t(rw: 'Umushoferi', fr: 'Chauffeur', en: 'Driver');
  String get notAssigned => _t(rw: 'Ntabwo aragena', fr: 'Non attribue', en: 'Not assigned');
  String get distance => _t(rw: 'Intera', fr: 'Distance', en: 'Distance');
  String get duration => _t(rw: 'Igihe', fr: 'Duree', en: 'Duration');
  String get fare => _t(rw: 'Amafaranga', fr: 'Tarif', en: 'Fare');
  String get rating => _t(rw: 'Amanota', fr: 'Evaluation', en: 'Rating');
  String get notRated => _t(rw: 'Ntabwo yatanzwe amanota', fr: 'Non evalue', en: 'Not rated');
  String get getHelp => _t(rw: 'Shaka ubufasha', fr: 'Obtenir de l’aide', en: 'Get help');
  String get tryAgain => _t(rw: 'Ongera ugerageze', fr: 'Reessayer', en: 'Try again');
  String get completedTrips => _t(rw: 'Ingendo warangije zizagaragara hano.', fr: 'Vos trajets termines apparaitront ici.', en: 'Your completed trips will appear here.');
  String get nothingHere => _t(rw: 'Nta kintu hano', fr: 'Rien ici', en: 'Nothing here');
  String get noRidesMatch => _t(rw: 'Nta ngendo zihura n’iri hitamo.', fr: 'Aucun trajet ne correspond a ce filtre.', en: 'No rides match this filter.');
  String get all => _t(rw: 'Zose', fr: 'Tous', en: 'All');
  String get paymentMethods => _t(rw: 'Uburyo bwo kwishyura', fr: 'Modes de paiement', en: 'Payment methods');
  String get howPay => _t(rw: 'Wifuza kwishyura ute?', fr: 'Comment souhaitez-vous payer ?', en: 'How would you like to pay?');
  String get pickupConfirmed => _t(rw: 'Emeza aho uhera', fr: 'Confirmer le depart', en: 'Confirm pickup');
  String get searchOrTypeAddress => _t(rw: 'Shakisha cyangwa wandike aderesi', fr: 'Rechercher ou saisir une adresse', en: 'Search or type the address');
  String get currentLocation => _t(rw: 'Aho uri ubu', fr: 'Position actuelle', en: 'Current location');
  String get searching => _t(rw: 'Turashakisha…', fr: 'Recherche…', en: 'Searching…');
  String get useThisAddress => _t(rw: 'Koresha iyi aderesi', fr: 'Utiliser cette adresse', en: 'Use this address');
  String get noLocationsFound => _t(rw: 'Nta hantu habonetse. Gerageza andi makuru.', fr: 'Aucun lieu trouve. Essayez une autre recherche.', en: 'No locations found. Try a different search.');
  String get noPlaceFoundMoveMap => _t(rw: 'Nta hantu habonetse kuri iyo aderesi. Imukura ikarita cyangwa ukomeze kwandika kugira ngo ushyire aho uri.', fr: 'Aucun lieu trouve pour cette adresse. Deplacez la carte ou continuez a saisir pour le definir.', en: 'No place found for that address. Move the map or keep typing to set it.');
  String get liveSearchUnavailable => _t(rw: 'Gushakisha ku mbaraga ntibirahuza. Andika aderesi uyemeze hasi, cyangwa hitamo aho wabitswe.', fr: 'La recherche en direct n’est pas encore connectee. Saisissez l’adresse et confirmez-la ci-dessous, ou choisissez un lieu enregistre.', en: 'Live search is not connected yet. Type the address and confirm it below, or choose a saved place.');
  String get couldNotReadLocation => _t(rw: 'Ntitwashoboye kumenya aho uri. Imukura ikarita.', fr: 'Impossible de lire votre position. Deplacez la carte.', en: 'Could not read your location. Move the map instead.');
  String get moveMapOrTypePickup => _t(rw: 'Imukura ikarita cyangwa wandike aderesi kugira ngo ushyire aho uhera.', fr: 'Deplacez la carte ou saisissez une adresse pour definir le depart.', en: 'Move the map or type an address to set your pickup.');
  String get permissionOffManual => _t(rw: 'Uruhushya rwo kumenya aho uri rwazimye — shyiraho aho uhera ubwawe.', fr: 'Autorisation de localisation desactivee — definissez le depart manuellement.', en: 'Location permission is off — set your pickup manually.');
  String get servicesOffManual => _t(rw: 'Serivisi yo kumenya aho uri izimye — shyiraho aho uhera ubwawe.', fr: 'Les services de localisation sont desactives — definissez le depart manuellement.', en: 'Location services are off — set your pickup manually.');
  String get couldNotReadLocationSetManual => _t(rw: 'Ntitwashoboye kumenya aho uri. Shyiraho aho uhera ubwawe.', fr: 'Impossible de lire votre position. Definissez le depart manuellement.', en: 'We could not read your location. Set your pickup manually.');
  String get locationNotGranted => _t(rw: 'Ntabwo wemeye kumenya aho uri. Ushobora gushyiraho aho uhera ubwawe.', fr: 'La position n’a pas ete autorisee. Vous pouvez definire le depart manuellement.', en: 'Location was not granted. You can set your pickup manually.');
  String get locationPermissionOffTitle => _t(rw: 'Uruhushya rwo kumenya aho uri rwazimye', fr: 'Autorisation de localisation desactivee', en: 'Location permission is off');
  String get manualEntryFallback => _t(rw: 'Ushobora kubika ukandika aho uhera ubwawe. Kugira ngo aho uri bugaragire kuri automatike, fungura uruhushya mu igenamiterere.', fr: 'Vous pouvez toujours reserver en saisissant votre depart manuellement. Pour activer le depart automatique, autorisez la localisation dans les parametres.', en: 'You can still book by entering your pickup point manually. To allow automatic pickup, turn on location permission in settings.');
  String get manualEntry => _t(rw: 'Kwandika ubwawe', fr: 'Saisie manuelle', en: 'Manual entry');
  String get openSettings => _t(rw: 'Fungura igenamiterere', fr: 'Ouvrir les parametres', en: 'Open settings');
  String get locationServicesOffTitle => _t(rw: 'Serivisi yo kumenya aho uri izimye', fr: 'Les services de localisation sont desactives', en: 'Location services are off');
  String get turnOnLocationServices => _t(rw: 'Fungura serivisi yo kumenya aho uri kugira ngo ukoreshe aho uhera ari automatike, cyangwa wandike aho uhera ubwawe.', fr: 'Activez les services de localisation pour utiliser le depart automatique, ou saisissez votre depart manuellement.', en: 'Turn on location services to use automatic pickup, or enter your pickup point manually.');
  String get setManually => _t(rw: 'Shyiraho ubwawe', fr: 'Saisir manuellement', en: 'Set manually');
  String get turnOn => _t(rw: 'Fungura', fr: 'Activer', en: 'Turn on');
  String get findingBestRoute => _t(rw: 'Turashaka inzira nziza…', fr: 'Recherche du meilleur itineraire…', en: 'Finding the best route…');
  String get calculatingRoute => _t(rw: 'Turashingira inzira…', fr: 'Calcul de l’itineraire…', en: 'Calculating route…');
  String minutes(int count) => _t(rw: '$count min', fr: '$count min', en: '$count min');
  String get confirmRideNotice => _t(rw: 'Uguhamya, umushoferi uri hafi afatanya nawe urugendo. Urashobora guhagarika urugendo igihe cytose mbere y’uko rutangira.', fr: 'En confirmant, un chauffeur disponible a proximite est assigne a votre trajet. Vous pouvez annuler a tout moment avant le depart.', en: 'By confirming, a nearby available driver is matched to your trip. You can cancel at any time before the trip starts.');
  String get noEstimateNote => _t(rw: 'Hitamo aya mfunguzo ku ikarita kugira ngo ubone amafaranga. Urashobora kubika urugendo kandi umushoferi azahurirana kuri amafaranga mbere y’urugendo.', fr: 'Selectionnez ces points sur la carte pour voir les tarifs. Vous pouvez toujours reserver et le chauffeur conviendra du tarif avant le trajet.', en: 'Select these points on the map to see fares. You can still book and the driver will agree the fare before the trip.');
  String get tripCompleted => _t(rw: 'Urugendo rwarangiye', fr: 'Trajet termine', en: 'Trip completed');
  String get finalFare => _t(rw: 'Amafaranga ya nyuma', fr: 'Tarif final', en: 'Final fare');
  String get commentOptional => _t(rw: 'Igitekerezo (si ngombwa)', fr: 'Commentaire (facultatif)', en: 'Comment (optional)');
  String get tellExperience => _t(rw: 'Tubwire uko urugendo rwagenze…', fr: 'Dites-nous comment s’est passe votre trajet…', en: 'Tell us about your experience…');
  String get submitRating => _t(rw: 'Ohereza amanota', fr: 'Envoyer l’evaluation', en: 'Submit rating');
  String get skip => _t(rw: 'Simbuka', fr: 'Passer', en: 'Skip');
  String get safety => _t(rw: 'Umutekano', fr: 'Securite', en: 'Safety');
  String get emergencyAssistance => _t(rw: 'Ubufasha bwihutirwa', fr: 'Assistance d’urgence', en: 'Emergency assistance');
  String get cancel => _t(rw: 'Hagarika', fr: 'Annuler', en: 'Cancel');
  String get callLabel => _t(rw: 'Hamagara', fr: 'Appeler', en: 'Call');
  String get messageLabel => _t(rw: 'Ubutumwa', fr: 'Message', en: 'Message');
  String get deleteAccount => _t(rw: 'Siba konti', fr: 'Supprimer le compte', en: 'Delete account');
  String get editProfile => _t(rw: 'Hindura umwirondoro', fr: 'Modifier le profil', en: 'Edit profile');
  String get helpSupport => _t(rw: 'Ubufasha n’inkunga', fr: 'Aide et assistance', en: 'Help & support');
  String get logout => _t(rw: 'Sohoka', fr: 'Se deconnecter', en: 'Log out');
  String get logoutQuestion => _t(rw: 'Urashaka gusohoka?', fr: 'Voulez-vous vous deconnecter ?', en: 'Log out?');
  String get stay => _t(rw: 'Guma', fr: 'Rester', en: 'Stay');
  String get account => _t(rw: 'Konti', fr: 'Compte', en: 'Account');
  String get accountActions => _t(rw: 'Ibikorwa bya konti', fr: 'Actions du compte', en: 'Account actions');
  String get passenger => _t(rw: 'Umugenzi', fr: 'Passager', en: 'Passenger');
  String get previewSession => _t(rw: 'Uburyo bwo kureba. Amakuru ya konti abikwa kuri iki gikoresho kugeza serivisi ihujwe.', fr: 'Session d’aperçu. Les donnees du compte sont stockees sur cet appareil jusqu’a la connexion du serveur.', en: 'Preview session. Account data is stored on this device until the backend is connected.');
  String get emergencyBody => _t(rw: 'Guhamagara ubutabazi bizakorwa FEM C@BS imaze gushyiraho nimero z’ubutabazi no guhuza serivisi. Mu gihe cy’amage, hamagara nimero y’ubutabazi yo hafi.', fr: 'Les appels d’urgence seront actives lorsque FEM C@BS aura configure les contacts nationaux et le serveur. En cas d’urgence, appelez directement le numero local.', en: 'Emergency calling will be enabled once FEM C@BS configures emergency contacts and backend integration. In a real emergency, call the local emergency number directly.');
  String get safetyPriority => _t(rw: 'Umutekano wawe ni wo dushyira imbere.\nIbikoresho biri hasi bigufasha kugenzura urugendo.', fr: 'Votre securite est notre priorite.\nLes outils ci-dessous vous aident a controler votre trajet.', en: 'Your safety is our priority.\nTools below help you control your trip.');
  String get saveChanges => _t(rw: 'Bika impinduka', fr: 'Enregistrer les modifications', en: 'Save changes');
  String get profilePhotoBackend => _t(rw: 'Ifoto y’umwirondoro izongerwaho serivisi imaze guhuzwa.', fr: 'La photo de profil sera disponible lorsque le serveur sera connecte.', en: 'Profile photos can be uploaded when the backend is connected.');
  String get howHelp => _t(rw: 'Twagufasha dute?', fr: 'Comment pouvons-nous vous aider ?', en: 'How can we help?');
  String get supportResponse => _t(rw: 'Twohereze ubutumwa — itsinda ryacu risubiza mu masaha 24.', fr: 'Envoyez-nous un message — notre equipe repond generalement sous 24 heures.', en: 'Send us a message — our team typically responds within 24 hours.');
  String get contactSupport => _t(rw: 'Hamagara ubufasha', fr: 'Contacter l’assistance', en: 'Contact support');
  String get subject => _t(rw: 'Umutwe', fr: 'Objet', en: 'Subject');
  String get tellWhatHappened => _t(rw: 'Tubwire ibyabaye', fr: 'Dites-nous ce qui s’est passe', en: 'Tell us what happened');
  String get describeIssue => _t(rw: 'Sobanura ikibazo mu nteruro nke…', fr: 'Decrivez votre probleme en quelques phrases…', en: 'Describe your issue in a few sentences…');
  String get sendMessage => _t(rw: 'Ohereza ubutumwa', fr: 'Envoyer le message', en: 'Send message');
  String get faq => _t(rw: 'Ibibazo bikunze kubazwa', fr: 'FAQ', en: 'FAQ');
  String get deleteYourAccount => _t(rw: 'Siba konti yawe', fr: 'Supprimer votre compte', en: 'Delete your account');
  String get deleteAccountBody => _t(rw: 'Ibi bizafunga burundu konti yawe kandi bisibe amakuru yawe bwite, aho wabitswe n’amateka y’ingendo. Iki gikorwa ntigisubira inyuma.', fr: 'Cette action fermera definitivement votre compte et supprimera vos donnees, lieux et historique. Elle est irreversible.', en: 'This will permanently close your account and remove your personal data, saved places and trip history. This action cannot be undone.');
  String get deleteConfirm => _t(rw: 'Ndumva ko iki gikorwa kidashobora gusubirwaho.', fr: 'Je comprends que cette action est irreversible.', en: 'I understand that this cannot be undone.');
  String get deleteMyAccount => _t(rw: 'Siba konti yanjye', fr: 'Supprimer mon compte', en: 'Delete my account');
  String get keepMyAccount => _t(rw: 'Gumana konti yanjye', fr: 'Garder mon compte', en: 'Keep my account');
  String get deleteFailed => _t(rw: 'Ntitwashoboye gusiba konti ubu. Ongera ugerageze.', fr: 'Nous ne pouvons pas supprimer votre compte maintenant. Reessayez.', en: 'We could not delete your account right now. Please try again.');
  String get adjustPickup => _t(rw: 'Hindura ikarita kugira ngo uhitemo aho uhera.', fr: 'Deplacez la carte pour ajuster le depart.', en: 'Move the map to adjust your pickup point.');
  String get searchUnavailable => _t(rw: 'Gushakisha ahantu ntibirahuza. Andika aderesi uyemeze.', fr: 'La recherche de lieux n’est pas encore connectee. Saisissez et confirmez l’adresse.', en: 'Location search is not connected yet. Type and confirm the address.');
  String get manualPickup => _t(rw: 'Shyiraho aho uhera wanditse', fr: 'Saisir le depart manuellement', en: 'Set pickup manually');
  String get paymentSecurityNotice => _t(rw: 'Kwishyura bikorwa mu mutekano na serivisi. Porogaramu ntibika nimero z’amakarita cyangwa kode za PIN.', fr: 'Les paiements sont traites de maniere securisee. Cette application ne stocke ni cartes ni codes PIN.', en: 'Payments are processed securely. This app never stores card or PIN details.');
  String paymentName(PaymentMethod method) => switch (method.id) {
        'cash' => payDriverDirectly,
        'mtn_momo' => payWithMomo,
        'airtel_money' => payWithAirtel,
        'card' => payWithCard,
        _ => method.name,
      };

  String get tripInProgress => _t(rw: 'Urugendo rurakomeje', fr: 'Course en cours', en: 'Trip in progress');
  String get rideHistory => _t(rw: 'Amateka y\'ingendo', fr: 'Historique des courses', en: 'Ride history');
  String get noRidesYet => _t(rw: 'Nta ngendo uragira', fr: 'Aucune course', en: 'No rides yet');
  String get support => _t(rw: 'Ubufasha', fr: 'Assistance', en: 'Support');

  // ========== DRIVER APP STRINGS ==========
  String get driverAppTitle => _t(rw: 'FEM C@BS Kinyobwa', fr: 'FEM C@BS Chauffeur', en: 'FEM C@BS Driver');
  String get driverLogin => _t(rw: 'Injira njya umushoferi', fr: 'Connexion chauffeur', en: 'Driver login');
  String get driverSignup => _t(rw: 'Iyandikishe njya umushoferi', fr: 'Inscription chauffeur', en: 'Driver sign up');
  String get driverRegister => _t(rw: 'Iyandikishe', fr: 'S\'inscrire', en: 'Sign up');
  String get driverWelcome => _t(rw: 'Murakaza neza kuri FEM C@BS', fr: 'Bienvenue sur FEM C@BS', en: 'Welcome to FEM C@BS');
  String get driverWelcomeBody => _t(rw: 'Kwinjira kugira ngo utangire gufata ingendo.', fr: 'Connectez-vous pour commencer a conduire.', en: 'Log in to start taking rides.');
  String get goOnline => _t(rw: 'Tangira gukora', fr: 'Passer en ligne', en: 'Go online');
  String get goOffline => _t(rw: 'Hagarika gukora', fr: 'Passer hors ligne', en: 'Go offline');
  String get youAreOnline => _t(rw: 'Uri mu buryo bw\'amikorere', fr: 'Vous etes en ligne', en: 'You are online');
  String get youAreOffline => _t(rw: 'Uri hanze y\'amikorere', fr: 'Vous etes hors ligne', en: 'You are offline');
  String get newRideRequest => _t(rw: 'Igicam cy\'urugendo gishya', fr: 'Nouvelle demande de course', en: 'New ride request');
  String get acceptRide => _t(rw: 'Emera urugendo', fr: 'Accepter la course', en: 'Accept ride');
  String get declineRide => _t(rw: 'Anka urugendo', fr: 'Refuser la course', en: 'Decline ride');
  String get rideAccepted => _t(rw: 'Urugendo rwemerewe', fr: 'Course acceptee', en: 'Ride accepted');
  String get headToPickup => _t(rw: 'Jya aho uhera', fr: 'Rendez-vous au point de depart', en: 'Head to pickup');
  String get markArrived => _t(rw: 'Menyesha ko maze kuhagera', fr: 'Indiquer mon arrivee', en: 'I\'ve arrived');
  String get enterPin => _t(rw: 'Injiza kode', fr: 'Entrer le code', en: 'Enter PIN');
  String get startTrip => _t(rw: 'Tangura urugendo', fr: 'Demarrer la course', en: 'Start trip');
  String get completeTrip => _t(rw: 'Rangiza urugendo', fr: 'Terminer la course', en: 'Complete trip');
  String get rideCompleted => _t(rw: 'Urugendo rwarangiye', fr: 'Course terminee', en: 'Ride completed');
  String get earnings => _t(rw: 'Amanjye', fr: 'Gains', en: 'Earnings');
  String get todayEarnings => _t(rw: 'Amanjye ya none', fr: 'Gains du jour', en: 'Today\'s earnings');
  String get thisWeek => _t(rw: 'Iyi week', fr: 'Cette semaine', en: 'This week');
  String get thisMonth => _t(rw: 'Uku kwezi', fr: 'Ce mois', en: 'This month');
  String get totalEarnings => _t(rw: 'Amanjye yose', fr: 'Total des gains', en: 'Total earnings');
  String get vehicleInfo => _t(rw: 'Amakuru y\'imodoka', fr: 'Informations vehicule', en: 'Vehicle info');
  String get documents => _t(rw: 'Inyandiko', fr: 'Documents', en: 'Documents');
  String get driverRatings => _t(rw: 'Amanota', fr: 'Evaluations', en: 'Ratings');
  String get driverSafety => _t(rw: 'Umutekano', fr: 'Securite', en: 'Safety');
  String get driverSettings => _t(rw: 'Igenamiterere', fr: 'Parametres', en: 'Settings');
  String get rideRequests => _t(rw: 'Ibicam by\'urugendo', fr: 'Demandes de course', en: 'Ride requests');
  String get pendingBalance => _t(rw: 'Igiciro gitegerezwa', fr: 'Solde en attente', en: 'Pending balance');
  String get avgRating => _t(rw: 'Amanota meza', fr: 'Note moyenne', en: 'Avg rating');
  String get completedRides => _t(rw: 'Ingendo zarangiye', fr: 'Courses terminees', en: 'Completed rides');
  String get arrivalConfirmation => _t(rw: 'Emeza ko wabonye umugenzi', fr: 'Confirmer l\'arrivee', en: 'Confirm arrival');
  String get ridePin => _t(rw: 'Kode y\'urugendo', fr: 'Code de course', en: 'Ride PIN');
  String get enterRidePin => _t(rw: 'Injiza kode y\'urugendo', fr: 'Entrez le code de course', en: 'Enter the ride PIN');
  String get passengerWillShowPin => _t(rw: 'Umugenzi azakwereke kode', fr: 'Le passager vous montrera le code', en: 'The passenger will show you the PIN');
  String get gpsTrackingActive => _t(rw: 'Kurikirana GPS birakora', fr: 'Suivi GPS actif', en: 'GPS tracking active');
  String get locationUpdatesSent => _t(rw: 'Amakuru y\'aho uri yoherejwe', fr: 'Position mise a jour', en: 'Location updates sent');
  String get earningsTodayLabel => _t(rw: 'Amanjye ya none', fr: 'Gains aujourd\'hui', en: 'Today');
  String get earningsWeekLabel => _t(rw: 'Iyi week', fr: 'Cette semaine', en: 'This week');
  String get earningsMonthLabel => _t(rw: 'Uku kwezi', fr: 'Ce mois', en: 'This month');
  String get earningsTotalLabel => _t(rw: 'Igiteranyo', fr: 'Total', en: 'Total');
  String get rideEarningsBreakdown => _t(rw: 'Incamake y\'amanjye', fr: 'Detail des gains', en: 'Earnings breakdown');
  String get waitingForRideRequest => _t(rw: 'Dutegereje igicam cy\'urugendo', fr: 'En attente d\'une demande', en: 'Waiting for ride request');
  String get driverNotFound => _t(rw: 'Umushoferi ntabonetse', fr: 'Chauffeur non trouve', en: 'Driver not found');
  String get enterPhoneNumber => _t(rw: 'Andika nimero ya telefoni', fr: 'Saisissez le numero de telephone', en: 'Enter phone number');
  String get driverRegistrationTitle => _t(rw: 'Iyandikishe njya umushoferi', fr: 'Inscription chauffeur', en: 'Become a driver');
  String get registrationDescription => _t(rw: 'Uzuza amakuri yawe y\'umushoferi', fr: 'Remplissez vos informations de chauffeur', en: 'Fill in your driver information');
  String get documentsRequired => _t(rw: 'Inyandiko z\'akenewe', fr: 'Documents requis', en: 'Required documents');
  String get uploadDocument => _t(rw: 'Kohereza inyandiko', fr: 'Telecharger un document', en: 'Upload document');
  String get driverProfile => _t(rw: 'Umwirondoro w\'umushoferi', fr: 'Profil chauffeur', en: 'Driver profile');
  String get editDriverProfile => _t(rw: 'Hindura umwirondoro', fr: 'Modifier le profil', en: 'Edit profile');
  String get earningsSummary => _t(rw: 'Incamake y\'amanjye', fr: 'Resume des gains', en: 'Earnings summary');
  String get markAllRead => _t(rw: 'Era wese byabonetse', fr: 'Tout marquer lu', en: 'Mark all as read');
  String get noNotifications => _t(rw: 'Nta menyesha', fr: 'Aucune notification', en: 'No notifications');
  String get activeRide => _t(rw: 'Urugendo ruri gukorwa', fr: 'Course active', en: 'Active ride');
  String get earningsDetail => _t(rw: 'Amakuru y\'amanjye', fr: 'Detail des gains', en: 'Earnings detail');

  static Future<Locale> loadSavedLocale() async {
    final prefs = await SharedPreferences.getInstance();
    final code = prefs.getString(AppConstants.prefLocaleKey) ?? 'rw';
    if (code == 'fr') return const Locale('fr');
    if (code == 'en') return const Locale('en');
    return const Locale('rw');
  }
}

class AppLocaleController extends ChangeNotifier {
  Locale _locale = const Locale('rw');

  Locale get locale => _locale;

  Future<void> initialize() async {
    _locale = await AppLocalizations.loadSavedLocale();
    notifyListeners();
  }

  Future<void> setLocale(Locale locale) async {
    if (!AppLocalizations.supportedLocales.contains(locale)) return;
    _locale = locale;
    notifyListeners();
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(AppConstants.prefLocaleKey, locale.languageCode);
  }
}

class _AppLocalizationsDelegate
    extends LocalizationsDelegate<AppLocalizations> {
  const _AppLocalizationsDelegate();

  @override
  bool isSupported(Locale locale) =>
      AppLocalizations.supportedLocales.any(
        (supported) => supported.languageCode == locale.languageCode,
      );

  @override
  Future<AppLocalizations> load(Locale locale) async {
    return AppLocalizations(locale);
  }

  @override
  bool shouldReload(_AppLocalizationsDelegate old) => false;
}

class _MaterialLocalizationsDelegate
    extends LocalizationsDelegate<MaterialLocalizations> {
  const _MaterialLocalizationsDelegate();

  @override
  bool isSupported(Locale locale) =>
      AppLocalizations.supportedLocales.any(
        (supported) => supported.languageCode == locale.languageCode,
      );

  @override
  Future<MaterialLocalizations> load(Locale locale) {
    return GlobalMaterialLocalizations.delegate.load(
      locale.languageCode == 'fr' ? locale : const Locale('en'),
    );
  }

  @override
  bool shouldReload(_MaterialLocalizationsDelegate old) => false;
}

class _WidgetsLocalizationsDelegate
    extends LocalizationsDelegate<WidgetsLocalizations> {
  const _WidgetsLocalizationsDelegate();

  @override
  bool isSupported(Locale locale) =>
      AppLocalizations.supportedLocales.any(
        (supported) => supported.languageCode == locale.languageCode,
      );

  @override
  Future<WidgetsLocalizations> load(Locale locale) {
    return GlobalWidgetsLocalizations.delegate.load(
      locale.languageCode == 'fr' ? locale : const Locale('en'),
    );
  }

  @override
  bool shouldReload(_WidgetsLocalizationsDelegate old) => false;
}

class _CupertinoLocalizationsDelegate
    extends LocalizationsDelegate<CupertinoLocalizations> {
  const _CupertinoLocalizationsDelegate();

  @override
  bool isSupported(Locale locale) =>
      AppLocalizations.supportedLocales.any(
        (supported) => supported.languageCode == locale.languageCode,
      );

  @override
  Future<CupertinoLocalizations> load(Locale locale) {
    return GlobalCupertinoLocalizations.delegate.load(
      locale.languageCode == 'fr' ? locale : const Locale('en'),
    );
  }

  @override
  bool shouldReload(_CupertinoLocalizationsDelegate old) => false;
}
